import { OrderClient } from './orderClient.interface';
import { PaymentSessionResponse } from './paymentSessionResponse.interface';

export interface OrderAndPaymentSession {
  order: OrderClient;
  paymentSession: PaymentSessionResponse;
}
