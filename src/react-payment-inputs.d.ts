declare module 'react-payment-inputs' {
  import type { InputHTMLAttributes } from 'react';

  interface CardImageProps {
    images: CardImages;
  }

  interface PaymentInputsMeta {
    cardType: { displayName: string; type: string } | undefined;
    erroredInputs: Record<string, string | undefined>;
    error: string | undefined;
    focused: string | undefined;
    isTouched: boolean;
  }

  interface UsePaymentInputsReturn {
    meta: PaymentInputsMeta;
    getCardNumberProps: (props?: InputHTMLAttributes<HTMLInputElement>) => InputHTMLAttributes<HTMLInputElement>;
    getExpiryDateProps: (props?: InputHTMLAttributes<HTMLInputElement>) => InputHTMLAttributes<HTMLInputElement>;
    getCVCProps: (props?: InputHTMLAttributes<HTMLInputElement>) => InputHTMLAttributes<HTMLInputElement>;
    getCardImageProps: (props: CardImageProps) => Record<string, unknown>;
    wrapperProps: Record<string, unknown>;
  }

  export function usePaymentInputs(): UsePaymentInputsReturn;

  export type CardImages = Record<string, string>;
}

declare module 'react-payment-inputs/images' {
  import type { CardImages } from 'react-payment-inputs';
  const images: Record<string, string>;
  export default images;
  export type { CardImages };
}
