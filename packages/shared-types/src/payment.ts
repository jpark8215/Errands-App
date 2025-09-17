import { PaymentStatus } from './enums';

export interface Payment {
  id: string;
  taskId: string;
  requesterId: string;
  taskerId: string;
  amount: number;
  platformFee: number;
  netAmount: number;
  status: PaymentStatus;
  paymentMethodId: string;
  stripePaymentIntentId?: string;
  createdAt: Date;
  processedAt?: Date;
  failureReason?: string;
}

export interface PaymentMethod {
  id: string;
  userId: string;
  stripePaymentMethodId: string;
  type: 'card' | 'bank_account';
  last4: string;
  brand?: string;
  isDefault: boolean;
  createdAt: Date;
}

export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  error?: string;
  requiresAction?: boolean;
  clientSecret?: string;
}

export interface EscrowResult {
  success: boolean;
  escrowId?: string;
  error?: string;
}

export interface FeeBreakdown {
  grossAmount: number;
  platformFee: number;
  processingFee: number;
  netAmount: number;
  instantPayoutFee?: number;
  totalFees: number;
}

export interface PayoutResult {
  success: boolean;
  payoutId?: string;
  amount: number;
  fees: number;
  netAmount: number;
  estimatedArrival: Date;
  error?: string;
}

export interface PaymentDispute {
  id: string;
  paymentId: string;
  reason: string;
  description: string;
  evidence: string[];
  status: 'open' | 'under_review' | 'resolved';
  createdAt: Date;
  resolvedAt?: Date;
  resolution?: string;
}

export interface RefundRequest {
  paymentId: string;
  amount: number;
  reason: string;
  requestedBy: string;
  approvedBy?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  processedAt?: Date;
}
