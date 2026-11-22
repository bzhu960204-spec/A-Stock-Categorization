package com.stockcard.service.liquidity;

/** Thrown by a client whose data source needs an API key that has not been configured. */
public class MissingApiKeyException extends RuntimeException {
    public MissingApiKeyException(String message) {
        super(message);
    }
}
