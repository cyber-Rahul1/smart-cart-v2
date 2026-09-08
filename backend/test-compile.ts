import { Entity, Column } from "typeorm"; 
@Entity() 
export class Test { 
  @Column() 
  prop: import("./test-compile.js").Test; 
}
