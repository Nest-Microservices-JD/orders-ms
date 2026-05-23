import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { NATS_SERVICE } from '../config';
import { PrismaService } from '../prisma.service';
import {
  ChangeOrderStatusFto,
  CreateOrderDto,
  OrderItemDto,
  OrderPaginationDto,
  PaidOrderDto,
} from './dto';
import {
  AllFilterOrderResponse,
  OrderClient,
  OrderItemClient,
  PaymentSessionResponse,
  ProductResponse,
} from './interfaces';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  constructor(
    private readonly prismaService: PrismaService,
    @Inject(NATS_SERVICE) private readonly natsClient: ClientProxy,
  ) {}

  public async create(createOrderDto: CreateOrderDto): Promise<OrderClient> {
    try {
      const productsIds: number[] = createOrderDto.items.map(
        (item: OrderItemDto) => item.productId,
      );

      const productsFound: ProductResponse[] =
        await this.findProductsByIds(productsIds);

      const totalAmount: number = this.getTotalAmount(
        createOrderDto,
        productsFound,
      );

      const totalItems: number = this.getTotalItems(createOrderDto);

      const orderCreated: OrderClient = await this.createFinalOrder(
        totalAmount,
        totalItems,
        createOrderDto,
        productsFound,
      );

      return this.mapperResponseOrder(orderCreated, productsFound);
    } catch (error) {
      throw new RpcException(error as object);
    }
  }

  private async findProductsByIds(
    productsIds: number[],
  ): Promise<ProductResponse[]> {
    return await firstValueFrom(
      this.natsClient.send({ cmd: 'validate_products' }, productsIds),
    );
  }

  public async findAll(
    orderPaginationDto: OrderPaginationDto,
  ): Promise<AllFilterOrderResponse> {
    const { limit = 10, page = 1, status } = orderPaginationDto;
    const currentPage: number = page;
    const perPage: number = limit;

    const totalPages: number = await this.prismaService.order.count({
      where: { status },
    });

    return {
      data: await this.prismaService.order.findMany({
        take: perPage,
        skip: (currentPage - 1) * perPage,
        where: { status },
      }),
      meta: {
        total: totalPages,
        page: currentPage,
        lastPage: Math.ceil(totalPages / perPage),
        perPage,
      },
    };
  }

  public async findOne(id: string): Promise<OrderClient | null> {
    const order: OrderClient | null = await this.prismaService.order.findFirst({
      where: { id },
      include: {
        OrderItem: {
          select: {
            price: true,
            quantity: true,
            productId: true,
          },
        },
      },
    });

    if (!order) {
      throw new RpcException({
        message: 'Order not found',
        status: HttpStatus.NOT_FOUND,
      });
    }

    const productsIds: number[] | undefined = order.OrderItem?.map(
      (item) => item.productId,
    );

    const productsFound: ProductResponse[] = await this.findProductsByIds(
      productsIds as number[],
    );

    return {
      ...order,
      ...this.mapperResponseOrder(order, productsFound),
    };
  }

  public async changeOrderStatus(
    changeOrderStatusDto: ChangeOrderStatusFto,
  ): Promise<OrderClient | null> {
    const { id, status } = changeOrderStatusDto;

    const orderFound: OrderClient | null = await this.findOne(id);

    if (orderFound?.status === status) {
      return orderFound;
    }

    return this.prismaService.order.update({
      where: { id },
      data: { status },
    });
  }

  public async createPaymentSession(
    orderCreate: OrderClient,
  ): Promise<PaymentSessionResponse> {
    const paymentSession = await firstValueFrom(
      this.natsClient.send('create.payment.session', {
        orderId: orderCreate.id,
        currency: 'usd',
        items: orderCreate.OrderItem?.map((item: OrderItemClient) => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
      }),
    );

    const { cancel_url, success_url, url, id } = paymentSession;

    return {
      cancelUrl: cancel_url,
      successUrl: success_url,
      url,
      id,
    };
  }

  public async paidOrder(paidOrderDto: PaidOrderDto): Promise<OrderClient> {
    this.logger.debug({ paidOrderDto });
    const { orderId, receiptUrl, stripePaymentId } = paidOrderDto;
    const orderUpdated: OrderClient = await this.prismaService.order.update({
      where: { id: orderId },
      data: {
        status: 'PAID',
        paid: true,
        paidAt: new Date(),
        stripeChargeId: stripePaymentId,
        orderReceipts: {
          create: {
            receiptUrl,
          },
        },
      },
    });
    return orderUpdated;
  }

  private getTotalItems(createOrderDto: CreateOrderDto): number {
    return createOrderDto.items.reduce(
      (acc: number, item: OrderItemDto) => acc + item.quantity,
      0,
    );
  }

  private getTotalAmount(
    createOrderDto: CreateOrderDto,
    productsFound: ProductResponse[],
  ): number {
    return createOrderDto.items.reduce((acc: number, item: OrderItemDto) => {
      const price: number =
        productsFound.find((product: ProductResponse) => {
          return product.id === item.productId;
        })?.price || 0;

      return acc + item.quantity * price;
    }, 0);
  }

  private mapperResponseOrder(
    orderCreated: OrderClient,
    productsFound: ProductResponse[],
  ): OrderClient {
    return {
      ...orderCreated,
      OrderItem: orderCreated.OrderItem?.map((item: OrderItemDto) => ({
        ...item,
        name:
          productsFound.find(
            (product: ProductResponse) => product.id === item.productId,
          )?.name || 'NO_NAME',
      })),
    };
  }

  private async createFinalOrder(
    totalAmount: number,
    totalItems: number,
    createOrderDto: CreateOrderDto,
    productsFound: ProductResponse[],
  ): Promise<OrderClient> {
    return await this.prismaService.order.create({
      data: {
        totalAmount,
        totalItems,
        OrderItem: {
          createMany: {
            data: createOrderDto.items.map((item: OrderItemDto) => ({
              productId: item.productId,
              quantity: item.quantity,
              price:
                productsFound.find(
                  (product: ProductResponse) => product.id === item.productId,
                )?.price || 0,
            })),
          },
        },
      },
      include: {
        OrderItem: {
          select: {
            price: true,
            quantity: true,
            productId: true,
          },
        },
      },
    });
  }
}
