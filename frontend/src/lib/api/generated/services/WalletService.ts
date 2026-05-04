/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class WalletService {
    /**
     * Get current user wallet balance and history
     * @returns any
     * @throws ApiError
     */
    public static walletControllerGetWallet(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/wallet/me',
        });
    }
    /**
     * Simulate wallet top-up (MVP only)
     * @returns any
     * @throws ApiError
     */
    public static walletControllerTopUp(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/wallet/topup',
        });
    }
}
