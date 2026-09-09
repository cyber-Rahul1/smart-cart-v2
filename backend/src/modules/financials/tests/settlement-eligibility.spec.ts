import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { Job } from 'bullmq';
import { SettlementEligibilityProcessor } from '../jobs/settlement-eligibility.processor.js';
import { SettlementInstructionService } from '../services/settlement-instruction.service.js';
import { JOB_EVALUATE_SETTLEMENT } from '../constants/financials.constants.js';
import { Order } from '../../orders/entities/order.entity.js';
import { OrderStatus } from '../../orders/enums/order-status.enum.js';
import { MealAllocation } from '../../community-meals/entities/meal-allocation.entity.js';

describe('SettlementEligibilityProcessor', () => {
  let processor: SettlementEligibilityProcessor;
  let dataSource: Partial<DataSource>;
  let settlementService: Partial<SettlementInstructionService>;
  let orderRepo: Partial<Repository<Order>>;
  let mealAllocationRepo: Partial<Repository<MealAllocation>>;

  beforeEach(async () => {
    orderRepo = {
      findOne: vi.fn(),
    };
    mealAllocationRepo = {
      findOne: vi.fn(),
    };
    dataSource = {
      getRepository: vi.fn().mockImplementation((entity) => {
        if (entity === Order) return orderRepo;
        if (entity === MealAllocation) return mealAllocationRepo;
        return {};
      }),
    };
    settlementService = {
      createInstruction: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementEligibilityProcessor,
        { provide: DataSource, useValue: dataSource },
        { provide: SettlementInstructionService, useValue: settlementService },
      ],
    }).compile();

    processor = module.get<SettlementEligibilityProcessor>(SettlementEligibilityProcessor);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createJob = (data: any, name = JOB_EVALUATE_SETTLEMENT): Job => {
    return { name, data } as Job;
  };

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should ignore job with unknown name', async () => {
    await processor.process(createJob({ orderId: '123' }, 'wrong_job_name'));
    expect(orderRepo.findOne).not.toHaveBeenCalled();
  });

  it('should throw error for malformed payload (missing orderId)', async () => {
    await expect(processor.process(createJob({}))).rejects.toThrow('Missing orderId in job payload');
    expect(orderRepo.findOne).not.toHaveBeenCalled();
  });

  it('should be a safe no-op if order is not found', async () => {
    (orderRepo.findOne as any).mockResolvedValue(null);
    await processor.process(createJob({ orderId: 'order-1' }));
    expect(mealAllocationRepo.findOne).not.toHaveBeenCalled();
    expect(settlementService.createInstruction).not.toHaveBeenCalled();
  });

  it('should be a safe no-op if order is not DELIVERED', async () => {
    (orderRepo.findOne as any).mockResolvedValue({ id: 'order-1', status: OrderStatus.OUT_FOR_DELIVERY });
    await processor.process(createJob({ orderId: 'order-1' }));
    expect(mealAllocationRepo.findOne).not.toHaveBeenCalled();
    expect(settlementService.createInstruction).not.toHaveBeenCalled();
  });

  it('should be a safe no-op for normal retail order (no MealAllocation)', async () => {
    (orderRepo.findOne as any).mockResolvedValue({ id: 'order-1', status: OrderStatus.DELIVERED });
    (mealAllocationRepo.findOne as any).mockResolvedValue(null);
    await processor.process(createJob({ orderId: 'order-1' }));
    expect(settlementService.createInstruction).not.toHaveBeenCalled();
  });

  it('should call createInstruction for a valid DELIVERED Community Meal order', async () => {
    (orderRepo.findOne as any).mockResolvedValue({ id: 'order-1', status: OrderStatus.DELIVERED });
    (mealAllocationRepo.findOne as any).mockResolvedValue({ id: 'alloc-1', orderId: 'order-1' });
    
    await processor.process(createJob({ orderId: 'order-1' }));
    expect(settlementService.createInstruction).toHaveBeenCalledWith('order-1');
  });

  it('should retry if infrastructure error occurs', async () => {
    (orderRepo.findOne as any).mockResolvedValue({ id: 'order-1', status: OrderStatus.DELIVERED });
    (mealAllocationRepo.findOne as any).mockResolvedValue({ id: 'alloc-1', orderId: 'order-1' });
    const dbError = new Error('Connection lost');
    (settlementService.createInstruction as any).mockRejectedValue(dbError);

    await expect(processor.process(createJob({ orderId: 'order-1' }))).rejects.toThrow('Connection lost');
  });

  it('should throw business error if it occurs', async () => {
    (orderRepo.findOne as any).mockResolvedValue({ id: 'order-1', status: OrderStatus.DELIVERED });
    (mealAllocationRepo.findOne as any).mockResolvedValue({ id: 'alloc-1', orderId: 'order-1' });
    const businessError = Object.assign(new Error('Invalid state'), { status: 400 });
    (settlementService.createInstruction as any).mockRejectedValue(businessError);

    await expect(processor.process(createJob({ orderId: 'order-1' }))).rejects.toThrow('Invalid state');
  });
});
