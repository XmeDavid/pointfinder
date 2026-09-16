package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.ChoiceOptionRequest;
import com.prayer.pointfinder.entity.AnswerType;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.entity.ChoiceOption;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ChoiceGradingTest {

    private static ChoiceOptionRequest option(String id, String text, boolean correct) {
        ChoiceOptionRequest r = new ChoiceOptionRequest();
        r.setId(id); r.setText(text); r.setCorrect(correct);
        return r;
    }

    private static Challenge choice(AnswerType type, ChoiceOption... options) {
        return Challenge.builder().answerType(type).choiceOptions(Arrays.asList(options)).build();
    }

    @Test
    void optionsGetStableIdsTrimmedTextAndTheRightNumberOfCorrectOnes() {
        List<ChoiceOption> options = ChoiceGrading.normalizeOptions(AnswerType.single_choice,
                List.of(option("keep-me", " Oak ", true), option(null, "Pine", false)));
        assertEquals("keep-me", options.get(0).getId());
        assertEquals("Oak", options.get(0).getText());
        assertNotNull(options.get(1).getId(), "a new option gets an id to keep across edits");
        assertNull(ChoiceGrading.normalizeOptions(AnswerType.text, List.of(option(null, "ignored", true))));

        assertEquals(ErrorCode.CHOICE_OPTIONS_INVALID, assertThrows(BadRequestException.class, () ->
                ChoiceGrading.normalizeOptions(AnswerType.single_choice, List.of(option(null, "Only", true)))).getErrorCode());
        assertThrows(BadRequestException.class, () ->
                ChoiceGrading.normalizeOptions(AnswerType.single_choice, List.of(option(null, "A", true), option(null, "B", true))));
        assertThrows(BadRequestException.class, () ->
                ChoiceGrading.normalizeOptions(AnswerType.multiple_choice, List.of(option(null, "A", false), option(null, "B", false))));
        assertThrows(BadRequestException.class, () ->
                ChoiceGrading.normalizeOptions(AnswerType.single_choice, List.of(option("x", "A", true), option("x", "B", false))));
        assertThrows(BadRequestException.class, () ->
                ChoiceGrading.normalizeOptions(AnswerType.single_choice, List.of(option(null, "A", true), option(null, "  ", false))));
    }

    @Test
    void duplicateTextsAreRefusedAndMissingIdsAreTakenFromTheSamePosition() {
        assertThrows(BadRequestException.class, () ->
                ChoiceGrading.normalizeOptions(AnswerType.single_choice, List.of(option(null, "Oak", true), option(null, "oak ", false))));
        List<ChoiceOption> existing = List.of(new ChoiceOption("id-1", "Oak", true), new ChoiceOption("id-2", "Pine", false));
        List<ChoiceOptionRequest> edited = ChoiceGrading.reconcileIds(existing, List.of(option(null, "Oak tree", true), option(null, "Pine", false), option(null, "Fir", false)));
        assertEquals("id-1", edited.get(0).getId());
        assertEquals("id-2", edited.get(1).getId());
        assertNull(edited.get(2).getId(), "a new option gets its id when normalized");
    }

    @Test
    void singleChoiceTakesExactlyOneKnownOption() {
        Challenge c = choice(AnswerType.single_choice, new ChoiceOption("a", "Oak", true), new ChoiceOption("b", "Pine", false));
        assertEquals(List.of("a"), ChoiceGrading.normalizeSelection(c, List.of("a")));
        assertEquals(ErrorCode.CHOICE_SELECTION_INVALID, assertThrows(BadRequestException.class,
                () -> ChoiceGrading.normalizeSelection(c, List.of("a", "b"))).getErrorCode());
        assertThrows(BadRequestException.class, () -> ChoiceGrading.normalizeSelection(c, List.of("zzz")));
        assertThrows(BadRequestException.class, () -> ChoiceGrading.normalizeSelection(c, List.of()));
        assertThrows(BadRequestException.class, () -> ChoiceGrading.normalizeSelection(c, null));
        assertTrue(ChoiceGrading.isCorrect(c, List.of("a")));
        assertFalse(ChoiceGrading.isCorrect(c, List.of("b")));
        assertEquals("Oak", ChoiceGrading.readableAnswer(c, List.of("a")));
    }

    @Test
    void multipleChoiceIsAllOrNothingAndOrderInsensitive() {
        Challenge c = choice(AnswerType.multiple_choice,
                new ChoiceOption("a", "Oak", true), new ChoiceOption("b", "Pine", true), new ChoiceOption("c", "Fir", false));
        assertTrue(ChoiceGrading.isCorrect(c, ChoiceGrading.normalizeSelection(c, List.of("b", "a", "a"))));
        assertFalse(ChoiceGrading.isCorrect(c, List.of("a")), "a subset is not enough");
        assertFalse(ChoiceGrading.isCorrect(c, List.of("a", "b", "c")), "an extra wrong option fails the whole answer");
        assertEquals("Oak; Pine", ChoiceGrading.readableAnswer(c, List.of("b", "a")), "texts follow option order");
    }
}
