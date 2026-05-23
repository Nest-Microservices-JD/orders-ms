import { Controller, ParseUUIDPipe } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import {
  ChangeOrderStatusFto,
  CreateOrderDto,
  OrderPaginationDto,
  PaidOrderDto,
} from './dto';
import {
  AllFilterOrderResponse,
  OrderAndPaymentSession,
  OrderClient,
  PaymentSessionResponse,
} from './interfaces';
import { OrdersService } from './orders.service';

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @MessagePattern('createOrder')
  public async create(
    @Payload() createOrderDto: CreateOrderDto,
  ): Promise<OrderAndPaymentSession> {
    const orderCreate: OrderClient =
      await this.ordersService.create(createOrderDto);
    const paymentSession: PaymentSessionResponse =
      await this.ordersService.createPaymentSession(orderCreate);

    return {
      order: orderCreate,
      paymentSession,
    };
  }

  @MessagePattern('findAllOrders')
  public findAll(
    @Payload() orderPaginationDto: OrderPaginationDto,
  ): Promise<AllFilterOrderResponse> {
    return this.ordersService.findAll(orderPaginationDto);
  }

  @MessagePattern('findOneOrder')
  public findOne(
    @Payload('id', ParseUUIDPipe) id: string,
  ): Promise<OrderClient | null> {
    return this.ordersService.findOne(id);
  }

  @MessagePattern('changeOrderStatus')
  public changeOrderStatus(
    @Payload() changeOrderStatusDto: ChangeOrderStatusFto,
  ): Promise<OrderClient | null> {
    return this.ordersService.changeOrderStatus(changeOrderStatusDto);
  }

  @EventPattern('payment.succeeded')
  public paidOrder(@Payload() paidOrderDto: PaidOrderDto) {
    return this.ordersService.paidOrder(paidOrderDto);
  }
}
