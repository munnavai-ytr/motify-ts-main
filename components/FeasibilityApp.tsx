'use client';

import React, { useCallback, useState } from 'react';
import type { WebRendererVideoCodec } from '@remotion/web-renderer';
import TestComposition from '@/remotion/TestComposition';
import type { CompiledComponentType } from '@/lib/compile';
import { EnvCheck, type EnvironmentInfo } from './EnvCheck';
import { PreviewTest } from './PreviewTest';
import { ExportTest } from './ExportTest';
import { AiTest } from './AiTest';
import { CompileTest } from './CompileTest';
import { SimulatedTransportPanel } from './SimulatedTransportPanel';

export function FeasibilityApp() {
  const [encodableVideoCodecs, setEncodableVideoCodecs] = useState<
    WebRendererVideoCodec[]
  >([]);

  const [activeComposition, setActiveComposition] = useState<{
    component: CompiledComponentType;
    isCompiled: boolean;
    key: number;
  }>({
    component: TestComposition,
    isCompiled: false,
    key: 0,
  });

  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');

  const handleEnvironmentReady = useCallback((info: EnvironmentInfo) => {
    setEncodableVideoCodecs(info.encodableVideoCodecs);
  }, []);

  const handleCompiledSuccess = useCallback(
    (component: CompiledComponentType) => {
      setRuntimeError(null);
      setActiveComposition((prev) => ({
        component,
        isCompiled: true,
        key: prev.key + 1,
      }));
    },
    []
  );

  const handleResetToBuiltIn = useCallback(() => {
    setRuntimeError(null);
    setActiveComposition((prev) => ({
      component: TestComposition,
      isCompiled: false,
      key: prev.key + 1,
    }));
  }, []);

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 overflow-x-hidden">
      <header className="border-b border-slate-800/90 bg-[#0B0F17]/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-4 sm:px-6 lg:px-8">
          <a
            href="#top"
            className="text-base sm:text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
          >
            Motion Feasibility Lab
          </a>

          <nav
            aria-label="Test sections"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400"
          >
            <a
              href="#environment"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Environment
            </a>
            <a
              href="#preview"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Preview
            </a>
            <a
              href="#export"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Export
            </a>
            <a
              href="#gemini"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Gemini
            </a>
            <a
              href="#compile"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Code Loop
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            {activeComposition.isCompiled ? (
              <button
                type="button"
                onClick={handleResetToBuiltIn}
                className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-100 transition-colors hover:bg-slate-700 whitespace-nowrap shrink-0"
              >
                Reset to Built-in
              </button>
            ) : (
              <a
                href="#compile"
                className="inline-flex min-h-[40px] items-center rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 whitespace-nowrap shrink-0"
              >
                AI Code Loop
              </a>
            )}
          </div>
        </div>
      </header>

      <main id="top" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100 text-balance">
            Phase 0 Browser Motion Feasibility
          </h1>
          <p className="mt-2 max-w-3xl text-sm sm:text-base leading-relaxed text-slate-400">
            End-to-end browser verification: Gemini REST code generation, Sucrase TSX
            compilation, Remotion Player preview, and WebCodecs MP4 export.
          </p>
        </div>

        <div className="space-y-6">
          <EnvCheck onEnvironmentReady={handleEnvironmentReady} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-7 min-w-0">
              <PreviewTest
                activeComponent={activeComposition.component}
                isCompiled={activeComposition.isCompiled}
                compositionKey={activeComposition.key}
                onResetToBuiltIn={handleResetToBuiltIn}
                onRuntimeError={setRuntimeError}
              />
            </div>

            <div className="lg:col-span-5 min-w-0">
              <ExportTest
                activeComponent={activeComposition.component}
                isCompiled={activeComposition.isCompiled}
                encodableVideoCodecs={encodableVideoCodecs}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-5 min-w-0">
              <AiTest
                apiKey={apiKey}
                onApiKeyChange={setApiKey}
                selectedModel={selectedModel}
                onSelectedModelChange={setSelectedModel}
              />
            </div>

            <div className="lg:col-span-7 min-w-0">
              <CompileTest
                apiKey={apiKey}
                selectedModel={selectedModel}
                runtimeError={runtimeError}
                onCompiledSuccess={handleCompiledSuccess}
              />
            </div>
          </div>

          {process.env.NODE_ENV !== 'production' && <SimulatedTransportPanel />}
        </div>
      </main>
    </div>
  );
}
