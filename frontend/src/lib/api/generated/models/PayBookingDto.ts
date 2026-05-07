/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type PayBookingDto = {
    /**
     * Payment token from payment gateway
     */
    paymentToken?: string;
    /**
     * Payment receipt URL or base64
     */
    receipt?: string;
    /**
     * If true, payment will be deducted from the user wallet
     */
    useWallet?: boolean;
};

