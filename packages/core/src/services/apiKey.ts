/**
 * API Key Selection Service
 * Manages multiple API keys per provider with load balancing strategies
 */

import { LLMProvider, ApiKeyConfig } from "../types/llm";

/**
 * Key selection strategy types
 */
export type KeySelectionStrategy = 'round-robin' | 'random' | 'weighted' | 'first-available';

/**
 * API Key Service for managing and selecting API keys
 */
export class ApiKeyService {
  private keyUsage: Map<string, number> = new Map(); // Track usage for round-robin
  private strategy: KeySelectionStrategy = 'round-robin';

  constructor(strategy: KeySelectionStrategy = 'round-robin') {
    this.strategy = strategy;
  }

  /**
   * Set the key selection strategy
   */
  setStrategy(strategy: KeySelectionStrategy): void {
    this.strategy = strategy;
  }

  /**
   * Get the current key selection strategy
   */
  getStrategy(): KeySelectionStrategy {
    return this.strategy;
  }

  /**
   * Select appropriate API key config for a request
   * @param provider The provider configuration
   * @returns Selected API key config or null if no enabled keys available
   */
  selectApiKey(provider: LLMProvider): ApiKeyConfig | null {
    const keys = this.getEnabledKeys(provider);
    if (keys.length === 0) return null;
    if (keys.length === 1) return keys[0];

    switch (this.strategy) {
      case 'random':
        return this.randomSelect(keys);
      case 'weighted':
        return this.weightedSelect(keys);
      case 'first-available':
        return keys[0];
      case 'round-robin':
      default:
        return this.roundRobinSelect(provider.name, keys);
    }
  }

  /**
   * Get enabled API keys from provider (handling legacy format)
   * @param provider The provider configuration
   * @returns Array of enabled API key configs
   */
  getEnabledKeys(provider: LLMProvider): ApiKeyConfig[] {
    // Handle legacy single apiKey
    if (provider.apiKey && !provider.apiKeys) {
      return [{ key: provider.apiKey, enabled: true }];
    }

    if (!provider.apiKeys || provider.apiKeys.length === 0) {
      return [];
    }

    return provider.apiKeys.filter(k => k.enabled !== false);
  }

  /**
   * Round-robin key selection
   * @param providerName The provider name for tracking
   * @param keys Array of API key configs
   * @returns Selected API key config
   */
  private roundRobinSelect(providerName: string, keys: ApiKeyConfig[]): ApiKeyConfig {
    const keyIndex = (this.keyUsage.get(providerName) || 0) % keys.length;
    this.keyUsage.set(providerName, keyIndex + 1);
    return keys[keyIndex];
  }

  /**
   * Random key selection
   * @param keys Array of API key configs
   * @returns Selected API key config
   */
  private randomSelect(keys: ApiKeyConfig[]): ApiKeyConfig {
    const randomIndex = Math.floor(Math.random() * keys.length);
    return keys[randomIndex];
  }

  /**
   * Weighted random key selection
   * @param keys Array of API key configs
   * @returns Selected API key config
   */
  private weightedSelect(keys: ApiKeyConfig[]): ApiKeyConfig {
    const totalWeight = keys.reduce((sum, key) => sum + (key.weight ?? 1), 0);
    let random = Math.random() * totalWeight;

    for (const key of keys) {
      random -= (key.weight ?? 1);
      if (random <= 0) {
        return key;
      }
    }

    return keys[0]; // Fallback to first key
  }

  /**
   * Reset usage tracking for a specific provider or all providers
   * @param providerName Optional provider name to reset, or undefined to reset all
   */
  resetUsage(providerName?: string): void {
    if (providerName) {
      this.keyUsage.delete(providerName);
    } else {
      this.keyUsage.clear();
    }
  }

  /**
   * Get usage statistics for all providers
   * @returns Map of provider name to usage count
   */
  getUsageStats(): Map<string, number> {
    return new Map(this.keyUsage);
  }

  /**
   * Normalize provider API keys to the new format
   * Handles migration from legacy single apiKey to apiKeys array
   * @param provider The provider configuration
   * @returns Normalized provider with apiKeys array
   */
  normalizeProviderKeys(provider: LLMProvider): LLMProvider {
    // If provider already has apiKeys, return as is
    if (provider.apiKeys && provider.apiKeys.length > 0) {
      return provider;
    }

    // If provider has legacy apiKey, migrate to new format
    if (provider.apiKey) {
      return {
        ...provider,
        apiKeys: [{ key: provider.apiKey, enabled: true }],
        apiKey: undefined, // Remove legacy field
      };
    }

    // Neither apiKey nor apiKeys present
    return provider;
  }

  /**
   * Validate API key configuration
   * @param provider The provider configuration
   * @returns Validation result with valid flag and error message
   */
  validateProviderKeys(provider: LLMProvider): { valid: boolean; error?: string } {
    const keys = this.getEnabledKeys(provider);

    if (keys.length === 0) {
      // Check if there are disabled keys
      if (provider.apiKeys && provider.apiKeys.length > 0) {
        return {
          valid: false,
          error: 'All API keys are disabled. At least one key must be enabled.',
        };
      }

      return {
        valid: false,
        error: 'No API keys configured. Please add at least one API key.',
      };
    }

    // Check all keys for valid structure
    for (const key of keys) {
      if (!key.key || key.key.trim() === '') {
        return {
          valid: false,
          error: 'All API keys must have a non-empty key value.',
        };
      }
    }

    return { valid: true };
  }
}
