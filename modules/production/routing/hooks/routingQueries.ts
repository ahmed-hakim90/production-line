import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/store/useAppStore';
import { routingPlanService } from '../services/routingPlanService';
import { routingStepService } from '../services/routingStepService';
import { routingExecutionService } from '../services/routingExecutionService';

export const routingQueryKeys = {
  activePlans: ['productionRouting', 'activePlans'] as const,
  plan: (id: string) => ['productionRouting', 'plan', id] as const,
  steps: (planId: string) => ['productionRouting', 'steps', planId] as const,
  execution: (id: string) => ['productionRouting', 'execution', id] as const,
  executionSteps: (id: string) => ['productionRouting', 'executionSteps', id] as const,
  completedExecutions: (n: number) => ['productionRouting', 'completed', n] as const,
};

export function useActiveRoutingPlansQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: routingQueryKeys.activePlans,
    queryFn: () => routingPlanService.getActivePlans(),
    enabled: options?.enabled !== false,
  });
}

export function useRoutingPlanQuery(planId: string | undefined) {
  return useQuery({
    queryKey: routingQueryKeys.plan(planId ?? ''),
    queryFn: () => routingPlanService.getById(planId!),
    enabled: Boolean(planId),
  });
}

export function useRoutingStepsQuery(planId: string | undefined) {
  return useQuery({
    queryKey: routingQueryKeys.steps(planId ?? ''),
    queryFn: () => routingStepService.getByPlanId(planId!),
    enabled: Boolean(planId),
  });
}

export function useRoutingExecutionQuery(executionId: string | undefined) {
  return useQuery({
    queryKey: routingQueryKeys.execution(executionId ?? ''),
    queryFn: () => routingExecutionService.getById(executionId!),
    enabled: Boolean(executionId) && executionId !== 'new',
  });
}

export function useRoutingExecutionStepsQuery(executionId: string | undefined) {
  return useQuery({
    queryKey: routingQueryKeys.executionSteps(executionId ?? ''),
    queryFn: () => routingExecutionService.getExecutionSteps(executionId!),
    enabled: Boolean(executionId) && executionId !== 'new',
  });
}

export function useCompletedRoutingExecutionsQuery(limit = 40) {
  return useQuery({
    queryKey: routingQueryKeys.completedExecutions(limit),
    queryFn: () => routingExecutionService.listCompleted(limit),
  });
}

export function usePublishRoutingPlanMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: routingPlanService.publishNewVersion,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['productionRouting'] });
    },
  });
}

export function useSoftDeleteRoutingPlanMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => routingPlanService.softDeletePlan(planId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['productionRouting'] });
      void useAppStore.getState().fetchRoutingPlanTotals();
    },
  });
}

export function useCompleteRoutingExecutionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { executionId: string; workerHourRate: number }) =>
      routingExecutionService.completeExecution(p.executionId, p.workerHourRate),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['productionRouting'] });
    },
  });
}

export function useDeleteCompletedRoutingExecutionMutation(limit = 100) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (executionId: string) => routingExecutionService.deleteCompletedExecution(executionId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['productionRouting'] });
      void qc.invalidateQueries({ queryKey: routingQueryKeys.completedExecutions(limit) });
    },
  });
}