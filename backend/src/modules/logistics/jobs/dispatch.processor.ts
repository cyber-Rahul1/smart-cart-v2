import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DISPATCH_QUEUE, JOB_EXPIRE_OFFER, JOB_DISPATCH_RETRY } from '../constants/logistics.constants.js';
import { OffersService } from '../services/offers.service.js';
import { DispatchService } from '../services/dispatch.service.js';

@Processor(DISPATCH_QUEUE)
export class DispatchProcessor extends WorkerHost {
  constructor(
    private readonly offersService: OffersService,
    private readonly dispatchService: DispatchService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case JOB_EXPIRE_OFFER:
        await this.offersService.expireOffer(job.data.offerId);
        break;
      case JOB_DISPATCH_RETRY:
        await this.dispatchService.attemptDispatch(job.data.deliveryId, job.data.expectedAttempt);
        break;
      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  }
}
