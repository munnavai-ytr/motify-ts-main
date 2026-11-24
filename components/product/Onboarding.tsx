'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
} from 'lucide-react';
import {
  GeminiRequestError,
  listGeminiModels,
  type GeminiModel,
} from '@/lib/gemini';
import { APP_NAME, GOOGLE_AI_STUDIO_KEY_URL } from '@/lib/constants';
import { setStoredApiKey, setStoredModel } from '@/lib/storage';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';

interface OnboardingProps {
  onComplete: (result: {
    apiKey: string;
    selectedModel: string;
    models: GeminiModel[];
  }) => void;
}

function pickDefaultModel(models: GeminiModel[]): string {
  const flash = models.find((m) => m.name.toLowerCase().includes('flash'));
  return flash?.name ?? models[0]?.name ?? '';
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validatingElapsedMs, setValidatingElapsedMs] = useState(0);
  const validateAbortRef = React.useRef<AbortController | null>(null);

  const [models, setModels] = useState<GeminiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');

  const [errorState, setErrorState] = useState<{
    friendly: string;
    action?: string;
    raw: string;
  } | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  React.useEffect(() => {
    if (!validating) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      setValidatingElapsedMs(Math.max(0, Date.now() - started));
    }, 100);
    return () => window.clearInterval(id);
  }, [validating]);

  React.useEffect(() => {
    return () => {
      validateAbortRef.current?.abort();
    };
  }, []);

  const handleStopValidation = () => {
    validateAbortRef.current?.abort();
    validateAbortRef.current = null;
    setValidating(false);
    setValidatingElapsedMs(0);
  };

  const handleValidateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed) return;

    const controller = new AbortController();
    validateAbortRef.current = controller;
    setValidating(true);
    setValidatingElapsedMs(0);
    setErrorState(null);
    setShowDetails(false);

    try {
      const { models: allModels } = await listGeminiModels(trimmed, {
        signal: controller.signal,
      });
      const capable = allModels.filter((m) =>
        m.supportedGenerationMethods.includes('generateContent')
      );

      if (capable.length === 0) {
        setErrorState({
          friendly:
            'Your key connected, but no models supporting content generation were found for this account.',
          raw: `listGeminiModels returned ${allModels.length} total models, 0 with generateContent.`,
        });
        return;
      }

      setModels(capable);
      setSelectedModel(pickDefaultModel(capable));
      setStep(2);
    } catch (err: unknown) {
      if (
        controller.signal.aborted ||
        (err instanceof DOMException && err.name === 'AbortError')
      ) {
        return;
      }
      if (err instanceof GeminiRequestError) {
        setErrorState({
          friendly: err.message,
          action: err.userAction,
          raw: `${err.explanation}\n\n${err.rawDetails}`,
        });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorState({
          friendly: 'Could not validate your key. Please try again.',
          raw: msg,
        });
      }
    } finally {
      if (validateAbortRef.current === controller) {
        validateAbortRef.current = null;
      }
      setValidating(false);
      setValidatingElapsedMs(0);
    }
  };

  const handleSaveModel = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedKey = keyInput.trim();
    if (!trimmedKey || !selectedModel) return;

    setStoredApiKey(trimmedKey);
    setStoredModel(selectedModel);
    onComplete({
      apiKey: trimmedKey,
      selectedModel,
      models,
    });
  };

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center bg-bg px-4 py-8 text-text">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between text-xs text-text-secondary">
          <span className="font-semibold text-text">{APP_NAME}</span>
          <span className="tabular-nums">Step {step} of 2</span>
        </div>

        <div className="rounded-[16px] border border-border bg-surface-1 p-6 sm:p-7">
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.form
                key="step-1"
                onSubmit={handleValidateKey}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-5"
              >
                <div>
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-[12px] border border-border bg-surface-2 text-accent">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <h1 className="text-xl font-semibold tracking-tight text-text text-balance">
                    Connect your Gemini key
                  </h1>
                  <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
                    Bring your own Google Gemini API key. Everything runs locally in your
                    browser with no account required.
                  </p>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label
                      htmlFor="onboarding-api-key"
                      className="text-xs font-medium text-text-secondary"
                    >
                      Gemini API key
                    </label>
                    <a
                      href={GOOGLE_AI_STUDIO_KEY_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline whitespace-nowrap"
                    >
                      <span>Get a free key</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  <div className="relative flex items-center">
                    <input
                      id="onboarding-api-key"
                      type={showKey ? 'text' : 'password'}
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      placeholder="Paste your API key"
                      autoComplete="off"
                      autoFocus
                      className="min-h-[44px] w-full rounded-[12px] border border-border bg-surface-2 py-2.5 pl-3.5 pr-12 font-mono text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <IconButton
                      aria-label={showKey ? 'Hide API key' : 'Show API key'}
                      onClick={() => setShowKey((prev) => !prev)}
                      className="absolute right-0.5"
                    >
                      {showKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </IconButton>
                  </div>
                </div>

                {errorState && (
                  <div
                    role="alert"
                    className="rounded-[12px] border border-danger/35 bg-danger/10 p-3.5 text-sm text-text"
                  >
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs leading-relaxed text-text">
                          {errorState.friendly}
                        </p>
                        {errorState.action && (
                          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                            {errorState.action}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowDetails((prev) => !prev)}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text"
                        >
                          <span>Details</span>
                          {showDetails ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                        {showDetails && (
                          <pre className="mt-2 max-h-40 overflow-auto rounded-[8px] border border-border bg-bg p-2.5 font-mono text-[11px] leading-relaxed text-text-secondary whitespace-pre-wrap break-words">
                            {errorState.raw}
                          </pre>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {validating && (
                  <div className="rounded-[12px] border border-border bg-surface-2/70 px-3 py-2.5 text-xs space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-text-secondary">
                        Checking key with Google...
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-text-muted tabular-nums">
                          {(validatingElapsedMs / 1000).toFixed(1)}s
                        </span>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={handleStopValidation}
                        >
                          Stop
                        </Button>
                      </div>
                    </div>
                    {validatingElapsedMs >= 25_000 && (
                      <p className="text-[11px] text-warning">
                        Still waiting for Google. You can stop and retry, or check your connection.
                      </p>
                    )}
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  loading={validating}
                  disabled={!keyInput.trim() || validating}
                >
                  {validating
                    ? `Checking key (${(validatingElapsedMs / 1000).toFixed(1)}s)...`
                    : 'Continue'}
                </Button>
              </motion.form>
            ) : (
              <motion.form
                key="step-2"
                onSubmit={handleSaveModel}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-5"
              >
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-text">
                    Choose a default model
                  </h1>
                  <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
                    Loaded {models.length} compatible models from your Gemini account.
                    You can change this anytime in Settings.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="onboarding-model-select"
                    className="block text-xs font-medium text-text-secondary"
                  >
                    Model
                  </label>
                  <select
                    id="onboarding-model-select"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="min-h-[44px] w-full rounded-[12px] border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {models.map((model) => (
                      <option key={model.name} value={model.name}>
                        {model.displayName} ({model.name.replace(/^models\//, '')})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2.5">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setStep(1)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Back</span>
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    fullWidth
                    disabled={!selectedModel}
                  >
                    Start creating
                  </Button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-text-muted">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          <span>Your key stays in this browser and is only sent to Google.</span>
        </p>
      </div>
    </div>
  );
}
