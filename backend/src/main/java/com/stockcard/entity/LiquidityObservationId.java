package com.stockcard.entity;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.time.LocalDate;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class LiquidityObservationId implements Serializable {
    private String seriesCode;
    private LocalDate obsDate;
}
