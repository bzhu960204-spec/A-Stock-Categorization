package com.stockcard.dto;

import com.stockcard.entity.EarningsReport;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public record EarningsReportRequest(
        @NotBlank @Size(max = 200) String title,
        @Size(max = 20) String fiscalPeriod,
        @Size(max = 20) String result,
        LocalDate reportDate,
        String content
) {
    public EarningsReport toEntity() {
        EarningsReport r = new EarningsReport();
        r.setTitle(title);
        r.setFiscalPeriod(fiscalPeriod);
        r.setResult(result);
        r.setReportDate(reportDate);
        r.setContent(content);
        return r;
    }
}
