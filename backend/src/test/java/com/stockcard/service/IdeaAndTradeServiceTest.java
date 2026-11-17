package com.stockcard.service;

import com.stockcard.entity.Idea;
import com.stockcard.entity.IdeaCategory;
import com.stockcard.entity.Trade;
import com.stockcard.entity.TradeCategory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.context.annotation.Import;

import static org.assertj.core.api.Assertions.assertThat;

/** Idea and Trade share the same "category folder + rated entries + search" rules. */
@DataJpaTest
@Import({IdeaService.class, TradeService.class})
class IdeaAndTradeServiceTest {

    @Autowired IdeaService ideaService;
    @Autowired TradeService tradeService;
    @Autowired TestEntityManager em;

    // ── Trade ─────────────────────────────────────────────────────────────────

    @Test
    void tradeCategoryNamesMustBeUnique() {
        assertThat(tradeService.createCategory("复盘")).isPresent();
        assertThat(tradeService.createCategory("复盘")).isEmpty();
    }

    @Test
    void tradeCategoryWithTradesCannotBeDeleted() {
        TradeCategory cat = tradeService.createCategory("成功").orElseThrow();
        Trade trade = tradeService.create("买入茅台", "<p>x</p>", null, 3, cat.getId());

        assertThat(tradeService.deleteCategory(cat.getId())).isEqualTo(TradeService.CategoryDeleteResult.HAS_TRADES);
        assertThat(tradeService.delete(trade.getId())).isTrue();
        assertThat(tradeService.deleteCategory(cat.getId())).isEqualTo(TradeService.CategoryDeleteResult.DELETED);
        assertThat(tradeService.deleteCategory(cat.getId())).isEqualTo(TradeService.CategoryDeleteResult.NOT_FOUND);
    }

    @Test
    void tradeRatingIsClampedAndTitleTrimmed() {
        assertThat(tradeService.create("  t  ", null, null, 9, null).getRating()).isEqualTo(5);
        Trade low = tradeService.create("t", null, null, -3, null);
        assertThat(low.getRating()).isZero();
        assertThat(tradeService.create("  t  ", null, null, null, null).getTitle()).isEqualTo("t");
    }

    @Test
    void tradeUpdateWithoutCategoryClearsIt() {
        TradeCategory cat = tradeService.createCategory("失败").orElseThrow();
        Trade trade = tradeService.create("t", null, null, 0, cat.getId());

        Trade updated = tradeService.update(trade.getId(), " ", "new", null, null, null).orElseThrow();

        assertThat(updated.getCategory()).isNull();
        assertThat(updated.getTitle()).isEqualTo("t"); // blank title keeps the old one
        assertThat(updated.getContent()).isEqualTo("new");
    }

    @Test
    void tradeSearchMatchesTitleAndContent() {
        tradeService.create("Alpha", "<p>gamma</p>", null, 0, null);
        tradeService.create("Beta", "<p>delta</p>", null, 0, null);

        assertThat(tradeService.search("ALPHA")).extracting(Trade::getTitle).containsExactly("Alpha");
        assertThat(tradeService.search(" delta ")).extracting(Trade::getTitle).containsExactly("Beta");
    }

    // ── Idea ──────────────────────────────────────────────────────────────────

    @Test
    void ideaCategoryWithIdeasCannotBeDeleted() {
        IdeaCategory cat = ideaService.createCategory("AI").orElseThrow();
        ideaService.create("算力", null, null, 0, cat.getId());

        assertThat(ideaService.deleteCategory(cat.getId())).isEqualTo(IdeaService.CategoryDeleteResult.HAS_IDEAS);
    }

    @Test
    void archivingCategoryArchivesItsIdeasAndUnarchiveRestoresThem() {
        IdeaCategory cat = ideaService.createCategory("AI").orElseThrow();
        Idea a = ideaService.create("a", null, null, 0, cat.getId());
        Idea b = ideaService.create("b", null, null, 0, cat.getId());
        Idea other = ideaService.create("other", null, null, 0, null);

        ideaService.archiveCategory(cat.getId());
        flushAndClear();

        assertThat(ideaService.getAll(null)).extracting(Idea::getId).containsExactly(other.getId());
        assertThat(ideaService.getArchived()).extracting(Idea::getId).containsExactlyInAnyOrder(a.getId(), b.getId());

        ideaService.unarchiveCategory(cat.getId());
        flushAndClear();

        assertThat(ideaService.getAll(cat.getId())).extracting(Idea::getId).containsExactlyInAnyOrder(a.getId(), b.getId());
        assertThat(ideaService.getArchived()).isEmpty();
    }

    @Test
    void restoringSingleIdeaAlsoRestoresItsArchivedFolder() {
        IdeaCategory cat = ideaService.createCategory("AI").orElseThrow();
        Idea idea = ideaService.create("a", null, null, 0, cat.getId());
        ideaService.archiveCategory(cat.getId());
        flushAndClear();

        Idea restored = ideaService.setArchived(idea.getId(), false).orElseThrow();
        flushAndClear();

        assertThat(restored.isArchived()).isFalse();
        assertThat(restored.getArchivedAt()).isNull();
        assertThat(em.find(IdeaCategory.class, cat.getId()).isArchived()).isFalse();
    }

    @Test
    void ideaSearchExcludesArchived() {
        Idea visible = ideaService.create("robotics", null, null, 0, null);
        Idea hidden = ideaService.create("robotics 2", null, null, 0, null);
        ideaService.setArchived(hidden.getId(), true);
        flushAndClear();

        assertThat(ideaService.search("robotics")).extracting(Idea::getId).containsExactly(visible.getId());
    }

    private void flushAndClear() {
        em.flush();
        em.clear();
    }
}
