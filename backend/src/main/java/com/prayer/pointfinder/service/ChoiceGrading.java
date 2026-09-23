package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.ChoiceOptionRequest;
import com.prayer.pointfinder.entity.AnswerType;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.entity.ChoiceOption;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * OW-34: the rules of choice challenges in one place. Options are validated
 * on save; a selection is graded on the server, all-or-nothing, and never
 * reveals which options were correct.
 */
public final class ChoiceGrading {

    public static final int MAX_OPTIONS = 12;
    public static final int MAX_OPTION_TEXT = 500;

    private ChoiceGrading() {}

    public static boolean isChoice(AnswerType type) {
        return type == AnswerType.single_choice || type == AnswerType.multiple_choice;
    }

    /**
     * Normalizes the operator's options for a choice challenge: at least two
     * non-blank options, a stable id for each (new ones get a UUID), exactly
     * one correct for single choice and at least one for multiple choice.
     * Returns null for non-choice types, which never carry options.
     */
    public static List<ChoiceOption> normalizeOptions(AnswerType type, List<ChoiceOptionRequest> raw) {
        if (!isChoice(type)) return null;
        if (raw == null || raw.size() < 2) {
            throw new BadRequestException("A choice challenge needs at least two options", ErrorCode.CHOICE_OPTIONS_INVALID);
        }
        if (raw.size() > MAX_OPTIONS) {
            throw new BadRequestException("A choice challenge may have at most " + MAX_OPTIONS + " options", ErrorCode.CHOICE_OPTIONS_INVALID);
        }
        Set<String> ids = new HashSet<>();
        Set<String> texts = new HashSet<>();
        List<ChoiceOption> options = new ArrayList<>();
        int correct = 0;
        for (ChoiceOptionRequest option : raw) {
            String text = option.getText() != null ? option.getText().trim() : "";
            if (text.isEmpty()) {
                throw new BadRequestException("Every option needs a text", ErrorCode.CHOICE_OPTIONS_INVALID);
            }
            if (text.length() > MAX_OPTION_TEXT) {
                throw new BadRequestException("An option text may have at most " + MAX_OPTION_TEXT + " characters", ErrorCode.CHOICE_OPTIONS_INVALID);
            }
            String id = option.getId() != null && !option.getId().isBlank() ? option.getId().trim() : UUID.randomUUID().toString();
            if (!ids.add(id)) {
                throw new BadRequestException("Option ids must be unique", ErrorCode.CHOICE_OPTIONS_INVALID);
            }
            if (!texts.add(text.toLowerCase(java.util.Locale.ROOT))) {
                throw new BadRequestException("Two options cannot have the same text", ErrorCode.CHOICE_OPTIONS_INVALID);
            }
            if (option.isCorrect()) correct++;
            options.add(ChoiceOption.builder().id(id).text(text).correct(option.isCorrect()).build());
        }
        if (type == AnswerType.single_choice && correct != 1) {
            throw new BadRequestException("A single-choice challenge needs exactly one correct option", ErrorCode.CHOICE_OPTIONS_INVALID);
        }
        if (type == AnswerType.multiple_choice && correct < 1) {
            throw new BadRequestException("A multiple-choice challenge needs at least one correct option", ErrorCode.CHOICE_OPTIONS_INVALID);
        }
        return options;
    }

    /** The selection a player sent, checked against the challenge's options. Order-insensitive, duplicates collapse. */
    public static List<String> normalizeSelection(Challenge challenge, List<String> selectedOptionIds) {
        List<ChoiceOption> options = challenge.getChoiceOptions() != null ? challenge.getChoiceOptions() : List.of();
        Set<String> known = options.stream().map(ChoiceOption::getId).collect(Collectors.toSet());
        Set<String> selected = new LinkedHashSet<>();
        if (selectedOptionIds != null) {
            for (String id : selectedOptionIds) if (id != null && !id.isBlank()) selected.add(id.trim());
        }
        if (selected.isEmpty()) {
            throw new BadRequestException("Choose an option", ErrorCode.CHOICE_SELECTION_INVALID);
        }
        if (!known.containsAll(selected)) {
            throw new BadRequestException("One of the chosen options does not belong to this challenge", ErrorCode.CHOICE_SELECTION_INVALID);
        }
        if (challenge.getAnswerType() == AnswerType.single_choice && selected.size() != 1) {
            throw new BadRequestException("Choose exactly one option", ErrorCode.CHOICE_SELECTION_INVALID);
        }
        return new ArrayList<>(selected);
    }

    /** All-or-nothing: the selection must be exactly the set of correct options. */
    public static boolean isCorrect(Challenge challenge, List<String> selection) {
        Set<String> correct = challenge.getChoiceOptions().stream()
                .filter(ChoiceOption::isCorrect).map(ChoiceOption::getId).collect(Collectors.toSet());
        return correct.equals(new HashSet<>(selection));
    }

    /** What an operator reads in the review queue: the chosen option texts as the player saw them, in option order. */
    public static String readableAnswer(Challenge challenge, List<String> selection, java.util.function.UnaryOperator<String> resolve) {
        Set<String> chosen = new HashSet<>(selection);
        return challenge.getChoiceOptions().stream()
                .filter(o -> chosen.contains(o.getId()))
                .map(o -> resolve.apply(o.getText()))
                .collect(Collectors.joining("; "));
    }

    public static String readableAnswer(Challenge challenge, List<String> selection) {
        return readableAnswer(challenge, selection, java.util.function.UnaryOperator.identity());
    }

    /**
     * An editor that round-trips texts but not ids would orphan every stored
     * selection; missing ids are taken from the existing option in the same
     * position before new ones are minted. An editor that sends ids already
     * says which options it kept, so its new options get fresh ids: taking a
     * positional id would duplicate a kept one or re-point earlier answers.
     */
    public static List<ChoiceOptionRequest> reconcileIds(List<ChoiceOption> existing, List<ChoiceOptionRequest> raw) {
        if (raw == null || existing == null) return raw;
        boolean sendsIds = raw.stream().anyMatch(o -> o != null && o.getId() != null && !o.getId().isBlank());
        if (sendsIds) return raw;
        for (int i = 0; i < raw.size() && i < existing.size(); i++) {
            ChoiceOptionRequest option = raw.get(i);
            if (option != null && (option.getId() == null || option.getId().isBlank())) option.setId(existing.get(i).getId());
        }
        return raw;
    }
}
