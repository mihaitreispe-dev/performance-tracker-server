import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type Request } from 'express';
import { HealthMetricType, WearableDataCategory, WearableProvider } from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { OpenWearablesService, PROVIDER_CAPABILITIES } from 'src/modules/openwearables/openwearables.service';
import { WearableSyncService } from 'src/modules/openwearables/wearable-sync.service';
import { DailyHealthMetricRepository } from 'src/repositories/daily-health-metric.repository';
import { OAuthStateRepository } from 'src/repositories/oauth-state.repository';
import { WearableProviderConnectionRepository } from 'src/repositories/wearable-provider-connection.repository';
import { WearableProviderPriorityRepository } from 'src/repositories/wearable-provider-priority.repository';

import {
  ConnectProviderQuery,
  GetActivityMetricsQuery,
  SetPrioritiesBody,
  TriggerSyncBody,
  WearableCallbackQuery,
} from './request.dto';
import {
  ActivityMetricsResponse,
  AvailableProvidersResponse,
  ConnectProviderResponse,
  SetPrioritiesResponse,
  SyncStatusResponse,
  TriggerSyncResponse,
  UserConnectionsResponse,
  UserPrioritiesResponse,
  WearableCallbackResponse,
} from './response.dto';

const PROVIDER_DISPLAY_NAMES: Record<WearableProvider, string> = {
  [WearableProvider.GARMIN]: 'Garmin',
  [WearableProvider.WHOOP]: 'WHOOP',
  [WearableProvider.OURA]: 'Oura',
  [WearableProvider.POLAR]: 'Polar',
  [WearableProvider.SUUNTO]: 'Suunto',
  [WearableProvider.APPLE_HEALTH]: 'Apple Health',
  [WearableProvider.SAMSUNG_HEALTH]: 'Samsung Health',
  [WearableProvider.FITBIT]: 'Fitbit',
  [WearableProvider.COROS]: 'COROS',
  [WearableProvider.WAHOO]: 'Wahoo',
};

@Injectable()
export class WearablesApiService {
  private readonly logger = new Logger(WearablesApiService.name);

  constructor(
    private readonly openWearablesService: OpenWearablesService,
    private readonly wearableSyncService: WearableSyncService,
    private readonly connectionRepo: WearableProviderConnectionRepository,
    private readonly priorityRepo: WearableProviderPriorityRepository,
    private readonly oauthStateRepo: OAuthStateRepository,
    private readonly healthMetricRepo: DailyHealthMetricRepository,
  ) {}

  async getAvailableProviders(): Promise<AvailableProvidersResponse> {
    const availableFromOW = await this.openWearablesService.getAvailableProviders();

    const providers = Object.values(WearableProvider)
      .filter((provider) => {
        // Only show providers available in OpenWearables
        const owProvider = provider.toLowerCase();
        return availableFromOW.some((p) => p.toLowerCase() === owProvider);
      })
      .map((provider) => ({
        provider,
        capabilities: PROVIDER_CAPABILITIES[provider] || [],
        displayName: PROVIDER_DISPLAY_NAMES[provider],
      }));

    return { providers };
  }

  async getUserConnections(req: Request & { user: AuthUser }): Promise<UserConnectionsResponse> {
    const userId = req.user.id;
    const connections = await this.connectionRepo.findMany({ userId });

    return {
      connections: connections.map((conn) => ({
        id: conn.id,
        provider: conn.provider,
        isActive: conn.is_active,
        supportedCategories: conn.supported_categories,
        connectedAt: conn.connected_at ?? undefined,
        lastSyncAt: conn.last_sync_at ?? undefined,
        lastSyncStatus: conn.last_sync_status ?? undefined,
        lastSyncError: conn.last_sync_error ?? undefined,
      })),
    };
  }

  async connectProvider(
    req: Request & { user: AuthUser },
    query: ConnectProviderQuery,
  ): Promise<ConnectProviderResponse> {
    const userId = req.user.id;
    const { provider } = query;

    // Get or create OpenWearables user
    let owUserId: string;
    const existingConn = await this.connectionRepo.findMany({ userId });
    if (existingConn.length > 0) {
      owUserId = existingConn[0].openwearables_user_id;
    } else {
      const owUser = await this.openWearablesService.createUser(userId);
      owUserId = owUser.id;
    }

    // Map our provider enum to OW provider string
    const owProvider = provider.toLowerCase();

    // Save OAuth state - encode owUserId and provider in the provider field
    // Format: openwearables:wearableProvider:owUserId
    const oauthState = await this.oauthStateRepo.create({
      user_id: userId,
      provider: `openwearables:${provider}:${owUserId}`,
    });

    // Get OAuth URL from OpenWearables, passing our state token
    const authUrl = await this.openWearablesService.getOAuthUrl(owUserId, owProvider);

    // Append our state token to the URL
    const urlWithState = new URL(authUrl);
    urlWithState.searchParams.set('state', oauthState.state_token);

    return { authUrl: urlWithState.toString() };
  }

  async handleCallback(query: WearableCallbackQuery): Promise<WearableCallbackResponse> {
    const { state, error } = query;

    if (error) {
      return { success: false, error };
    }

    // Find OAuth state by token
    const oauthState = await this.oauthStateRepo.findByStateToken(state);
    if (!oauthState) {
      return { success: false, error: 'Invalid or expired state' };
    }

    // Parse provider field: "openwearables:wearableProvider:owUserId"
    const parts = oauthState.provider.split(':');
    if (parts.length !== 3 || parts[0] !== 'openwearables') {
      return { success: false, error: 'Invalid state format' };
    }
    const provider = parts[1] as WearableProvider;
    const owUserId = parts[2];

    try {
      // Get connections from OpenWearables to verify
      const owConnections = await this.openWearablesService.getUserConnections(owUserId);
      const owProvider = provider.toLowerCase();
      const owConnection = owConnections.find((c) => c.provider.toLowerCase() === owProvider);

      if (!owConnection || owConnection.status !== 'active') {
        return { success: false, error: 'Provider not connected in OpenWearables' };
      }

      // Get provider capabilities
      const capabilities = PROVIDER_CAPABILITIES[provider] || [];

      // Save connection in our database
      await this.connectionRepo.upsert({
        user_id: oauthState.user_id,
        provider,
        openwearables_user_id: owUserId,
        external_user_id: owConnection.external_user_id ?? null,
        is_active: true,
        supported_categories: capabilities,
        connected_at: new Date(),
      });

      // Set as highest priority for all supported categories
      for (const category of capabilities) {
        await this.priorityRepo.setProviderAsHighestPriority(oauthState.user_id, category, provider);
      }

      // Cleanup OAuth state
      await this.oauthStateRepo.deleteByStateToken(state);

      // Trigger initial sync
      this.wearableSyncService.syncAllForUser(oauthState.user_id, 30).catch((err) => {
        this.logger.error(`Initial sync failed for user ${oauthState.user_id}: ${err}`);
      });

      return { success: true, provider };
    } catch (err) {
      this.logger.error(`Callback handling failed: ${err}`);
      return { success: false, error: 'Failed to complete connection' };
    }
  }

  async disconnectProvider(req: Request & { user: AuthUser }, provider: WearableProvider): Promise<void> {
    const userId = req.user.id;

    const connection = await this.connectionRepo.findByUserAndProvider(userId, provider);
    if (!connection) {
      throw new NotFoundException(`No connection found for provider ${provider}`);
    }

    // Delete connection
    await this.connectionRepo.deleteByUserAndProvider(userId, provider);

    // Delete priorities for this provider
    await this.priorityRepo.deleteByUserAndProvider(userId, provider);
  }

  async getUserPriorities(req: Request & { user: AuthUser }): Promise<UserPrioritiesResponse> {
    const userId = req.user.id;
    const priorities = await this.priorityRepo.findByUser(userId);

    // Group by category
    const categoryMap = new Map<WearableDataCategory, { provider: WearableProvider; priority: number }[]>();
    for (const p of priorities) {
      const list = categoryMap.get(p.category) || [];
      list.push({ provider: p.provider, priority: p.priority });
      categoryMap.set(p.category, list);
    }

    const categories = Array.from(categoryMap.entries()).map(([category, items]) => ({
      category,
      priorities: items.sort((a, b) => a.priority - b.priority),
    }));

    return { categories };
  }

  async setPriorities(req: Request & { user: AuthUser }, body: SetPrioritiesBody): Promise<SetPrioritiesResponse> {
    const userId = req.user.id;
    const { category, priorities } = body;

    // Verify all providers are connected and support this category
    for (const item of priorities) {
      const connection = await this.connectionRepo.findByUserAndProvider(userId, item.provider);
      if (!connection || !connection.is_active) {
        throw new BadRequestException(`Provider ${item.provider} is not connected`);
      }
      if (!connection.supported_categories.includes(category)) {
        throw new BadRequestException(`Provider ${item.provider} does not support ${category}`);
      }
    }

    // Update priorities
    for (const item of priorities) {
      await this.priorityRepo.upsertPriority(userId, category, item.provider, item.priority);
    }

    return { success: true };
  }

  async triggerSync(req: Request & { user: AuthUser }, body: TriggerSyncBody): Promise<TriggerSyncResponse> {
    const userId = req.user.id;
    const daysBack = body.daysBack || 7;

    if (body.provider) {
      // Sync specific provider
      await this.wearableSyncService.triggerProviderSync(userId, body.provider);
    }

    // Run full sync
    const result = await this.wearableSyncService.syncAllForUser(userId, daysBack);

    return {
      success: true,
      workouts: result.workouts,
      sleep: result.sleep,
      healthMetrics: result.healthMetrics,
      activity: result.activity,
    };
  }

  async getSyncStatus(req: Request & { user: AuthUser }): Promise<SyncStatusResponse> {
    const userId = req.user.id;
    const connections = await this.connectionRepo.findMany({ userId, isActive: true });

    return {
      providers: connections.map((conn) => ({
        provider: conn.provider,
        lastSyncAt: conn.last_sync_at ?? undefined,
        lastSyncStatus: conn.last_sync_status ?? undefined,
        lastSyncError: conn.last_sync_error ?? undefined,
      })),
    };
  }

  async getActivityMetrics(
    req: Request & { user: AuthUser },
    query: GetActivityMetricsQuery,
  ): Promise<ActivityMetricsResponse> {
    const userId = req.user.id;

    // Default to last 7 days if no dates provided
    const today = new Date();
    const defaultFrom = new Date(today);
    defaultFrom.setDate(defaultFrom.getDate() - 6);

    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : defaultFrom;
    const dateTo = query.dateTo ? new Date(query.dateTo) : today;

    // Get the priority provider for activity data
    const priorityProvider = await this.priorityRepo.getHighestPriorityProvider(userId, WearableDataCategory.ACTIVITY);

    // Fetch all activity metrics
    const [stepsMetrics, caloriesMetrics, distanceMetrics] = await Promise.all([
      this.healthMetricRepo.findMany({
        userId,
        metricType: HealthMetricType.STEPS,
        dateFrom,
        dateTo,
        ...(priorityProvider && { provider: priorityProvider }),
      }),
      this.healthMetricRepo.findMany({
        userId,
        metricType: HealthMetricType.ACTIVE_CALORIES,
        dateFrom,
        dateTo,
        ...(priorityProvider && { provider: priorityProvider }),
      }),
      this.healthMetricRepo.findMany({
        userId,
        metricType: HealthMetricType.DISTANCE,
        dateFrom,
        dateTo,
        ...(priorityProvider && { provider: priorityProvider }),
      }),
    ]);

    // Group by date
    const dateMap = new Map<
      string,
      { steps?: number; activeCalories?: number; distance?: number; provider?: WearableProvider }
    >();

    for (const metric of stepsMetrics) {
      const dateStr = metric.metric_date.toISOString().split('T')[0];
      const existing = dateMap.get(dateStr) || {};
      existing.steps = Number(metric.value);
      existing.provider = metric.provider;
      dateMap.set(dateStr, existing);
    }

    for (const metric of caloriesMetrics) {
      const dateStr = metric.metric_date.toISOString().split('T')[0];
      const existing = dateMap.get(dateStr) || {};
      existing.activeCalories = Number(metric.value);
      if (!existing.provider) existing.provider = metric.provider;
      dateMap.set(dateStr, existing);
    }

    for (const metric of distanceMetrics) {
      const dateStr = metric.metric_date.toISOString().split('T')[0];
      const existing = dateMap.get(dateStr) || {};
      existing.distance = Number(metric.value);
      if (!existing.provider) existing.provider = metric.provider;
      dateMap.set(dateStr, existing);
    }

    // Convert to array and sort by date
    const data = Array.from(dateMap.entries())
      .map(([date, metrics]) => ({
        date,
        steps: metrics.steps,
        activeCalories: metrics.activeCalories,
        distance: metrics.distance,
        provider: metrics.provider,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { data };
  }
}
