/**
 * `@paystack/inline-js` v2 ships no type declarations, so we declare the slice
 * of its API that this project uses.
 * Docs: node_modules/@paystack/inline-js/README.md
 */
declare module '@paystack/inline-js' {
  export interface PaystackTransactionResult {
    id: number;
    reference: string;
    message: string;
    status?: string;
    trans?: string;
    transaction?: string;
    trxref?: string;
  }

  export interface PaystackCallbacks {
    onSuccess?: (transaction: PaystackTransactionResult) => void;
    onCancel?: () => void;
    onError?: (error: { message: string }) => void;
    onLoad?: (response: { id: number; customer: unknown; accessCode: string }) => void;
    onElementsMount?: (elements: unknown) => void;
  }

  export interface PaystackTransactionOptions extends PaystackCallbacks {
    key: string;
    email: string;
    amount: number;
    currency?: string;
    reference?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    channels?: string[];
    label?: string;
    plan?: string;
    subaccount?: string;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  }

  export interface PopupTransaction {
    cancel: () => void;
    [key: string]: unknown;
  }

  export default class PaystackPop {
    newTransaction(options: PaystackTransactionOptions): PopupTransaction;
    resumeTransaction(accessCode: string, callbacks?: PaystackCallbacks): PopupTransaction;
    cancelTransaction(id: string | number): void;
    preventElementsFromBubbling?: () => void;
  }
}
