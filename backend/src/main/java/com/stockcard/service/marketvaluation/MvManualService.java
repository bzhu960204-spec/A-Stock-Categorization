package com.stockcard.service.marketvaluation;

import com.stockcard.entity.MvManualSeries;
import com.stockcard.entity.MvObservation;
import com.stockcard.entity.MvObservationId;
import com.stockcard.repository.MvManualSeriesRepository;
import com.stockcard.repository.MvObservationRepository;
import com.stockcard.service.liquidity.SeriesPoint;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** User-defined series (buyback yield, NDX ROE ... that have no free feed) and the combined series catalog (design §3.3, §5.7). */
@Service
public class MvManualService {

    public record CatalogEntry(String code, String name, String unit, String frequency, String source, String kind, String group,
                               String direction, int typicalLagDays, boolean estimate, String description) {}

    /** The prefix keeps manual codes from ever clashing with a built-in code. */
    private static final Pattern CODE = Pattern.compile("^M_[A-Z0-9_]{1,44}$");

    private final MvManualSeriesRepository seriesRepo;
    private final MvObservationRepository obsRepo;

    public MvManualService(MvManualSeriesRepository seriesRepo, MvObservationRepository obsRepo) {
        this.seriesRepo = seriesRepo;
        this.obsRepo = obsRepo;
    }

    public List<CatalogEntry> catalog() {
        List<CatalogEntry> out = new ArrayList<>();
        for (MvCatalog.Info i : MvCatalog.all()) {
            out.add(new CatalogEntry(i.code(), i.name(), i.unit(), i.frequency().name(), i.source() == null ? null : i.source().name(),
                    i.kind().name(), i.group().name(), i.direction().name(), i.typicalLagDays(), i.estimate(), i.description()));
        }
        for (MvManualSeries m : seriesRepo.findAllByOrderByCodeAsc()) {
            out.add(new CatalogEntry(m.getCode(), m.getName(), m.getUnit(), MvSeries.Frequency.EVENT.name(), MvSource.MANUAL.name(),
                    MvSeries.Kind.MANUAL.name(), MvSeries.Group.MANUAL.name(), MvSeries.Direction.NONE.name(), 90, false, m.getDescription()));
        }
        return out;
    }

    public List<MvManualSeries> list() {
        return seriesRepo.findAllByOrderByCodeAsc();
    }

    @Transactional
    public MvManualSeries create(String code, String name, String unit, String description) {
        String normalized = code == null ? "" : code.trim().toUpperCase();
        if (!CODE.matcher(normalized).matches()) {
            throw new IllegalArgumentException("code 必须以 M_ 开头，只能包含大写字母、数字和下划线（最长 46 位）");
        }
        if (name == null || name.isBlank() || name.trim().length() > 100) throw new IllegalArgumentException("name 不能为空且不超过 100 字");
        if (unit == null || unit.isBlank() || unit.trim().length() > 20) throw new IllegalArgumentException("unit 不能为空且不超过 20 字");
        if (description != null && description.length() > 500) throw new IllegalArgumentException("description 不能超过 500 字");
        if (seriesRepo.existsById(normalized)) throw new ResponseStatusException(HttpStatus.CONFLICT, "序列已存在: " + normalized);

        MvManualSeries series = new MvManualSeries();
        series.setCode(normalized);
        series.setName(name.trim());
        series.setUnit(unit.trim());
        series.setDescription(description == null || description.isBlank() ? null : description.trim());
        return seriesRepo.save(series);
    }

    /** Deletes the series together with all its observations. */
    @Transactional
    public void delete(String code) {
        requireSeries(code);
        obsRepo.deleteAllBySeriesCode(code);
        seriesRepo.deleteById(code);
    }

    /** Upserts observations (same date overwrites); returns the number of rows written. */
    @Transactional
    public int upsertObservations(String code, List<SeriesPoint> points) {
        requireSeries(code);
        if (points.isEmpty()) throw new IllegalArgumentException("没有可保存的观测值");
        LocalDateTime now = LocalDateTime.now();
        for (SeriesPoint p : points) {
            if (p.date() == null) throw new IllegalArgumentException("date 不能为空");
            if (!Double.isFinite(p.value())) throw new IllegalArgumentException("value 必须是有效数字");
            MvObservation o = new MvObservation();
            o.setSeriesCode(code);
            o.setObsDate(p.date());
            o.setObsValue(p.value());
            o.setSource(MvSource.MANUAL.name());
            o.setEstimate(false);
            o.setFetchedAt(now);
            obsRepo.save(o);
        }
        return points.size();
    }

    @Transactional
    public void deleteObservation(String code, LocalDate date) {
        requireSeries(code);
        MvObservationId id = new MvObservationId(code, date);
        if (!obsRepo.existsById(id)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "观测值不存在");
        obsRepo.deleteById(id);
    }

    private void requireSeries(String code) {
        if (!seriesRepo.existsById(code)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "手动序列不存在: " + code);
    }
}
