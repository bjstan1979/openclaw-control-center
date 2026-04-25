import type { ExecutionLock, HallTaskCard } from "../types";

export class HallExecutionLockError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 409) {
    super(message);
    this.name = "HallExecutionLockError";
    this.statusCode = statusCode;
  }
}

export function acquireHallExecutionLock(
  taskCard: HallTaskCard,
  input: { ownerParticipantId: string; ownerLabel: string; at?: string },
): HallTaskCard {
  const at = input.at ?? new Date().toISOString();
  const activeLock = taskCard.executionLock && !taskCard.executionLock.releasedAt ? taskCard.executionLock : undefined;
  if (activeLock && activeLock.ownerParticipantId !== input.ownerParticipantId) {
    throw new HallExecutionLockError(
      `${activeLock.ownerLabel} already holds execution for ${taskCard.projectId}:${taskCard.taskId}.`,
    );
  }
  const executionLock: ExecutionLock = {
    taskId: taskCard.taskId,
    projectId: taskCard.projectId,
    ownerParticipantId: input.ownerParticipantId,
    ownerLabel: input.ownerLabel,
    acquiredAt: activeLock?.acquiredAt ?? at,
  };
  return {
    ...taskCard,
    stage: "execution",
    currentOwnerParticipantId: input.ownerParticipantId,
    currentOwnerLabel: input.ownerLabel,
    executionLock,
    updatedAt: at,
  };
}

export function releaseHallExecutionLock(
  taskCard: HallTaskCard,
  reason: string,
  at = new Date().toISOString(),
): HallTaskCard {
  const activeLock = taskCard.executionLock && !taskCard.executionLock.releasedAt ? taskCard.executionLock : undefined;
  if (!activeLock) return taskCard;
  return {
    ...taskCard,
    executionLock: {
      ...activeLock,
      releasedAt: at,
      releasedReason: reason,
    },
    updatedAt: at,
  };
}

export function assertHallExecutionAllowed(taskCard: HallTaskCard, participantId: string): void {
  const activeLock = taskCard.executionLock && !taskCard.executionLock.releasedAt ? taskCard.executionLock : undefined;
  if (taskCard.stage !== "execution") return;
  if (!activeLock) return;
  if (activeLock.ownerParticipantId !== participantId) {
    throw new HallExecutionLockError(
      `${activeLock.ownerLabel} currently owns execution for ${taskCard.projectId}:${taskCard.taskId}.`,
      403,
    );
  }
}

export function acquireHallExecutionLockForParticipant(
  taskCard: HallTaskCard,
  input: { ownerParticipantId: string; ownerLabel: string; at?: string },
): HallTaskCard {
  const at = input.at ?? new Date().toISOString();
  const locks = taskCard.executionLocks ?? [];
  const existing = locks.find(
    (lock) => lock.ownerParticipantId === input.ownerParticipantId && !lock.releasedAt,
  );
  if (existing) {
    return {
      ...taskCard,
      stage: "execution",
      updatedAt: at,
    };
  }
  const newLock: ExecutionLock = {
    taskId: taskCard.taskId,
    projectId: taskCard.projectId,
    ownerParticipantId: input.ownerParticipantId,
    ownerLabel: input.ownerLabel,
    acquiredAt: at,
  };
  const activeIds = [
    ...new Set([
      ...(taskCard.activeOwnerParticipantIds ?? []),
      input.ownerParticipantId,
    ]),
  ];
  return {
    ...taskCard,
    stage: "execution",
    activeOwnerParticipantIds: activeIds,
    currentOwnerParticipantId: activeIds[0],
    currentOwnerLabel: input.ownerLabel,
    executionLocks: [...locks, newLock],
    updatedAt: at,
  };
}

export function releaseHallExecutionLockForParticipant(
  taskCard: HallTaskCard,
  participantId: string,
  reason: string,
  at = new Date().toISOString(),
): HallTaskCard {
  const locks = taskCard.executionLocks ?? [];
  const updatedLocks = locks.map((lock) =>
    lock.ownerParticipantId === participantId && !lock.releasedAt
      ? { ...lock, releasedAt: at, releasedReason: reason }
      : lock,
  );
  const activeIds = (taskCard.activeOwnerParticipantIds ?? []).filter(
    (id) => id !== participantId,
  );
  return {
    ...taskCard,
    activeOwnerParticipantIds: activeIds.length > 0 ? activeIds : undefined,
    currentOwnerParticipantId: activeIds[0] ?? taskCard.currentOwnerParticipantId,
    executionLocks: updatedLocks,
    updatedAt: at,
  };
}

export function assertHallExecutionAllowedForParticipant(taskCard: HallTaskCard, participantId: string): void {
  if (taskCard.stage !== "execution") return;
  const locks = taskCard.executionLocks ?? [];
  const active = locks.find(
    (lock) => lock.ownerParticipantId === participantId && !lock.releasedAt,
  );
  if (active) return;
  const activeIds = taskCard.activeOwnerParticipantIds ?? [];
  if (activeIds.length === 0) return;
  if (!activeIds.includes(participantId)) {
    const activeOwners = locks
      .filter((lock) => !lock.releasedAt)
      .map((lock) => lock.ownerLabel)
      .join(", ");
    throw new HallExecutionLockError(
      `${activeOwners} currently own execution for ${taskCard.projectId}:${taskCard.taskId}.`,
      403,
    );
  }
}