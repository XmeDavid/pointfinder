package com.prayer.pointfinder.core.model

import kotlinx.serialization.Serializable

@Serializable
data class Stage(
    val id: EntityId,
    val gameId: EntityId? = null,
    val name: String,
    val description: String = "",
    val orderIndex: Int = 0,
    val transitionType: String = "manual",
    val scheduledAt: String? = null,
    val triggerBaseId: EntityId? = null,
    val isActive: Boolean = false,
    val baseIds: List<EntityId>? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class CreateStageRequest(
    val name: String,
    val description: String? = null,
    val transitionType: String = "manual",
    val scheduledAt: String? = null,
    val triggerBaseId: EntityId? = null,
)

@Serializable
data class UpdateStageRequest(
    val name: String,
    val description: String? = null,
    val transitionType: String = "manual",
    val scheduledAt: String? = null,
    val triggerBaseId: EntityId? = null,
)

@Serializable
data class ReorderStagesRequest(val ids: List<EntityId>)
