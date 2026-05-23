import { IsString, IsUrl, IsUUID } from 'class-validator';

export class PaidOrderDto {
  @IsString()
  stripePaymentId: string;

  @IsString()
  @IsUUID()
  orderId: string;

  @IsString()
  @IsUrl()
  receiptUrl: string;

  constructor(stripePaymentId: string, orderId: string, receiptUrl: string) {
    this.stripePaymentId = stripePaymentId;
    this.orderId = orderId;
    this.receiptUrl = receiptUrl;
  }
}
