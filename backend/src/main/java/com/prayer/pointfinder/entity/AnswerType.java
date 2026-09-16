package com.prayer.pointfinder.entity;

public enum AnswerType {
    text,
    file,
    none,
    /** OW-34: exactly one correct option, graded on the server. */
    single_choice,
    /** OW-34: one or more correct options, graded all-or-nothing on the server. */
    multiple_choice
}
