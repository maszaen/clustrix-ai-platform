(function() {
  'use strict';

  // Stream Handling
  function createStreamHandler(streamId, text, isFirstInteraction = false) {
    log("STREAM", 2, "createStreamHandler", "Stream handler created", {
      streamId,
      isFirstInteraction,
    });
    let fullResponse = "";
    let sawEnd = false;
    let seenMeaningfulToken = false;
    let finalized = false;
    
    // Smart rendering throttling system
    let lastRenderTime = 0;
    let lastRenderLength = 0;
    let renderTimeout = null;
    let isUsingWorker = false;

    const END_RX = /<!--\s*\[\/END\]\s*-->[\s]*$/;
    const trimEnd = (s) => s.replace(/\s*<!--\s*\[\/END\]\s*-->\s*$/, "");

    const getState = () => streamManager.activeStreams?.[streamId] || null;

    const cleanupStream = () => {
      const st = streamManager.activeStreams?.[streamId];
      if (st) {
        st.fullResponse = fullResponse;
        st.sawEnd = true;
        delete streamManager.activeStreams[streamId];
        for (const k in streamManager.byKey)
          if (streamManager.byKey[k] === streamId) delete streamManager.byKey[k];
      }
      updateInputState?.();
    };

    const showThinking = () => {
      const s = getState();
      if (!s) return;
      if (!s.aiNode || !document.contains(s.aiNode)) return;
      let el = s.aiNode.querySelector(".inline-loader");
      if (!el) {
        el = document.createElement("div");
        el.className = "inline-loader";
        s.aiNode.appendChild(el);
      }
      if (el.dataset.state !== "thinking") {
        el.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>`;
        el.dataset.state = "thinking";
      }
    };

    const hideLoader = () => {
      const s = getState();
      if (!s) return;
      if (!s.aiNode || !document.contains(s.aiNode)) return;
      const el = s.aiNode.querySelector(".inline-loader");
      if (el?.parentNode) el.parentNode.removeChild(el);
    };

    function clearContinuePlaceholder(aiNode) {
      if (!aiNode) return;
      const footer = aiNode.querySelector(".message-footer");
      if (footer) footer.innerHTML = "";
    }

    function renderContinuePlaceholder(
      aiNode,
      session,
      messageIndex,
      seedText,
      opts = {},
    ) {
      const { disabledMs = 3000, interrupted = false } = opts;

      collapseSpacer();

      if (!aiNode || !document.contains(aiNode)) return;

      let footer = aiNode.querySelector(".message-footer");
      if (!footer) {
        footer = document.createElement("div");
        footer.className = "message-footer";
        const messageContent = aiNode.querySelector(".message-content");
        if (messageContent) {
          messageContent.appendChild(footer);
        } else {
          aiNode.appendChild(footer);
        }
      }
      footer.innerHTML = "";

      const placeholderCard = document.createElement("div");
      placeholderCard.className = "continue-placeholder";

      const hint = document.createElement("span");
      hint.className = "placeholder-hint";
      hint.textContent = interrupted
        ? "Response interrupted by user"
        : "Do you see incomplete response?";

      const btn = document.createElement("button");
      btn.className = "primary-btn continue-fragment";
      btn.textContent = interrupted ? "Continue" : "Continue";
      btn.disabled = true;
      if (interrupted) btn.title = "Continue from interrupted point";

      placeholderCard.appendChild(hint);
      placeholderCard.appendChild(btn);

      footer.appendChild(placeholderCard);

      setTimeout(
        () => {
          btn.disabled = false;
        },
        Math.max(0, disabledMs),
      );

      btn.addEventListener("click", () => {
        footer.innerHTML = "";

        const existingMessage = session.messages[messageIndex];
        const modelInfo = Array.isArray(existingMessage)
          ? existingMessage[2]
          : null;
        session.messages[messageIndex] = ["ai", seedText, modelInfo];
        log(
          "STREAM",
          2,
          "renderContinuePlaceholder:click",
          "Continuing stream, preserving modelInfo.",
          { modelInfo },
        );

        const msgs = buildResumeMessagesFromSession(
          session,
          messageIndex,
          seedText,
        );

        const textEl = aiNode.querySelector(".message-text");
        if (textEl) {
          // For continue, append thinking markup to existing partial content
          textEl.innerHTML += getThinkingMarkup();
          scheduleThinkingText(aiNode);
        }

        startStream(
          session,
          "[System] Resume",
          aiNode,
          messageIndex,
          false,
          msgs,
        );
        updateInputState?.();
      });
    }

    const finalize = async ({ interrupted = false, reason = null } = {}) => {
      log("STREAM", 2, "finalize", "Finalizing stream", {
        streamId,
        interrupted,
        sawEnd,
        hasContent: fullResponse.trim().length > 0,
      });
      if (finalized) return;
      finalized = true;

      const s = getState();
      if (!s) return;
      const { session: streamSession, aiNode, messageIndex } = s;

      // Get the actual session from state.sessions to ensure we're working with the same object
      const session = state.sessions.find(sess => sess.id === streamSession.id);
      if (!session) return;

      const existingMessageData = session.messages[messageIndex];
      const modelInfo =
        existingMessageData && Array.isArray(existingMessageData)
          ? existingMessageData[2]
          : null;
      log("FINALIZE", 1, "finalize", "Preparing to save final message.", {
        hasModelInfo: !!modelInfo,
        modelInfo,
      });

      const display = trimEnd(fullResponse);
      const hasContent = display.length > 0;
      const hasEnd = END_RX.test(fullResponse) || sawEnd;

      const isComplete = hasEnd || !interrupted;

      // Collapse response spacer when response is complete
      if (isComplete) {
        collapseSpacer();
      }

      let finalMessageToSave = display;
      if (interrupted) {
        collapseSpacer();
        const formattedError = formatErrorMessageForSaving(reason);
        finalMessageToSave = hasContent
          ? `${display}\n\n${formattedError}`
          : formattedError;
      }

      if (finalMessageToSave || interrupted) {
        // Check for pending web search data and apply it to modelInfo
        const pendingPageCount = getAndClearPendingWebSearchData(session.id);
        if (pendingPageCount !== null) {
          modelInfo.webSearchPages = pendingPageCount;
          console.log("Applied pending web search data to finalized message:", { sessionId: session.id, pageCount: pendingPageCount });
        }
        
        // Include thinking data if exists
        if (session._x_think && session._x_think[messageIndex]) {
          modelInfo.thinkContent = session._x_think[messageIndex];
        }
        
        // Include thinking updates if exists
        if (session._x_think_updates && session._x_think_updates[messageIndex]) {
          modelInfo.thinkingUpdate = session._x_think_updates[messageIndex];
        }

        session.messages[messageIndex] = ["ai", finalMessageToSave, modelInfo];
        
        // Track updated message for incremental save
        if (!session._newMessages) {
          session._newMessages = [];
        }
        session._newMessages.push([messageIndex, ["ai", finalMessageToSave, modelInfo]]);
        
        log(
          "FINALIZE",
          2,
          "finalize",
          "Final message saved to state with modelInfo.",
          { content: finalMessageToSave.substring(0, 50) + "...", modelInfo },
        );
      } else if (interrupted) {
        collapseSpacer();
        
        // Include thinking data if exists (for interrupted messages)
        if (session._x_think && session._x_think[messageIndex]) {
          modelInfo.thinkContent = session._x_think[messageIndex];
        }
        
        // Include thinking updates if exists (for interrupted messages)
        if (session._x_think_updates && session._x_think_updates[messageIndex]) {
          modelInfo.thinkingUpdate = session._x_think_updates[messageIndex];
        }
        
        session.messages[messageIndex] = [
          "ai",
          formatErrorMessageForSaving(reason),
          modelInfo,
        ];
        
        // Track updated message for incremental save
        if (!session._newMessages) {
          session._newMessages = [];
        }
        session._newMessages.push([messageIndex, ["ai", formatErrorMessageForSaving(reason), modelInfo]]);
      }

      if (aiNode) {
        setNodeMetadata(aiNode, modelInfo || {});
        if (
          aiNode._thinkingEl &&
          modelInfo &&
          modelInfo.webSearchPages &&
          modelInfo.webSearchPages > 0
        ) {
          updateThinkingToggleForWebSearch(aiNode, modelInfo.webSearchPages);
        }
      }

      if (aiNode && document.contains(aiNode)) {
        hideLoader();
        const div = aiNode.querySelector(".message-text");
        if (div) {
          const thinkingContainer = div.querySelector('.thinking-wrap');
          const thinkingText = session._x_think && session._x_think[messageIndex] ? session._x_think[messageIndex].text : '';
          if (thinkingContainer && finalMessageToSave && finalMessageToSave.trim() === thinkingText.trim()) {
            // Don't append duplicate thinking content
          } else if (thinkingContainer && finalMessageToSave) {
            // Append final content after thinking
            const finalDiv = document.createElement('div');
            finalDiv.className = 'final-ai-response';
            md(finalMessageToSave).then(html => {
              finalDiv.innerHTML = html;
              div.appendChild(finalDiv);
              if (div.querySelector("pre code")) highlightAllUnder(div);
              attachCodeBlockListeners(finalDiv);
              renderMathInElement(div);
            }).catch(err => {
              console.warn('Markdown finalization error:', err);
              finalDiv.innerHTML = mdFallback(finalMessageToSave);
              div.appendChild(finalDiv);
              if (div.querySelector("pre code")) highlightAllUnder(div);
              attachCodeBlockListeners(finalDiv);
              renderMathInElement(div);
            });
          } else if (!thinkingContainer) {
            md(finalMessageToSave || "").then(html => {
              div.innerHTML = html;
              if (div.querySelector("pre code")) highlightAllUnder(div);
              attachCodeBlockListeners(div);
              renderMathInElement(div);
            }).catch(err => {
              console.warn('Markdown finalization error:', err);
              div.innerHTML = mdFallback(finalMessageToSave || "");
              if (div.querySelector("pre code")) highlightAllUnder(div);
              attachCodeBlockListeners(div);
              renderMathInElement(div);
            });
          }
        }

        clearContinuePlaceholder(aiNode);

        if (hasContent && !isComplete && !interrupted) {
          renderContinuePlaceholder(aiNode, session, messageIndex, display, {
            disabledMs: 1200,
            interrupted: false,
          });
          restoreAiMessageAutoHeight();
        }

        renderAiFinalActions(aiNode, finalMessageToSave, messageIndex);
      }

      s.fullResponse = finalMessageToSave;
      s.sawEnd = isComplete;
      s.endSeen = isComplete;
      cleanupStream();

      // Remove streaming-active class from the specific AI message
      if (aiNode) {
        aiNode.classList.remove('streaming-active');
        log("STREAM", 1, "finalize", "Removed streaming-active class from AI message", {});
      }

      // Reset streaming active flag for column-reverse autoscroll
      isStreamingActive = false;

      try {
        renderSessions?.();
      } catch {}
      try {
        updateChatHeader?.();
      } catch {}
      
      // Cancel any pending debounced saves before immediate save
      try {
        debouncedSave?.cancel?.();
      } catch {}
      
      try {
        await save?.();
      } catch {}
      
      // Auto-cache session after streaming completes for instant restore
      // CRITICAL: Only cache if this session is currently active to prevent caching wrong content
      try {
        if (session && session.id && current && current.id === session.id) {
          const chatLog = $("#chat-log");
          if (chatLog && chatLog.innerHTML.trim()) {
            const scroller = getChatScroller();
            const scrollPos = scroller ? scroller.scrollTop : 0;
            cacheSession(session.id, chatLog.innerHTML, scrollPos, session._lazyState);
            log("CACHE", 1, "finalize", "Auto-cached session after streaming completed");
          }
        } else if (session && session.id && (!current || current.id !== session.id)) {
          log("CACHE", 1, "finalize", "Skipped caching - session not currently active", {
            streamSessionId: session.id,
            currentSessionId: current?.id
          });
        }
      } catch (err) {
        log("CACHE", 3, "finalize", "Failed to cache session after streaming", { error: err });
      }

      // if (hasContent && (!session.name || /untitled/i.test(session.name))) {
      //   try { generateAndSetTitle?.(session); } catch {}
      // }
    };

    showThinking();

    return (evt) => {
      const s = getState();
      if (!s) return;

      const isDone =
        evt === null ||
        evt === "[DONE]" ||
        (typeof evt === "object" &&
          (evt.done === true || evt.type === "done" || evt.event === "done"));

      if (isDone) {
        finalize();
        return;
      }
      if (evt?.error) {
        log("IPC-RENDERER", "onEvent", "MENERIMA payload error dari main", {
          payload: evt.error,
        });
        finalize({ interrupted: true, reason: evt.error });
        return;
      }

      let token = "";
      if (typeof evt === "string") token = evt;
      else if (evt && typeof evt === "object") {
        token =
          evt.delta?.content ||
          evt.choices?.[0]?.delta?.content ||
          evt.content ||
          (typeof evt.data === "string" ? evt.data : "");
      }
      if (!token) return;

      // Debug logging to trace token flow
      const currentSetting = state.settings.streamThrottling || "auto";

      try {
        bumpToken(s.session, s.messageIndex);
      } catch {}

      if (!seenMeaningfulToken && /\S/.test(token)) {
        seenMeaningfulToken = true;

        if (s.thinkStartTime) {
          const durationSeconds = (Date.now() - s.thinkStartTime) / 1000;

          const { session, messageIndex } = s;

          session._x_think = session._x_think || {};

          if (
            typeof session._x_think[messageIndex] !== "object" ||
            session._x_think[messageIndex] === null
          ) {
            const existingText = session._x_think[messageIndex] || "";
            session._x_think[messageIndex] = { text: existingText };
          }

          session._x_think[messageIndex].duration = durationSeconds;
          saveThinkingDebounced();

          const messageData =
            Array.isArray(session.messages) &&
            Array.isArray(session.messages[messageIndex])
              ? session.messages[messageIndex]
              : null;
          const messageMetadata =
            messageData && typeof messageData[2] === "object" ? messageData[2] : {};
          setNodeMetadata(s.aiNode, messageMetadata);

          finalizeThinkingUI(s.aiNode, durationSeconds, messageMetadata);
          delete s.thinkStartTime;
        }
        if (s.aiNode && document.contains(s.aiNode)) {
          // Cancel any ongoing thinking text updates since we're transitioning to real content
          cancelThinkingText(s.aiNode);
          
          const textDiv = s.aiNode.querySelector(".message-text");
          if (textDiv) {
            // Keep the thinking indicator visible and let it transition naturally
            // Don't clear the textDiv yet - let the streaming logic handle the transition
            const thinkingContainer = textDiv.querySelector('.thinking-container');
            if (thinkingContainer) {
              // Keep the thinking container and update the text to show transition
              const thinkingTextIndicator = thinkingContainer.querySelector('.thinking-text-indicator');
              if (thinkingTextIndicator) {
                thinkingTextIndicator.textContent = 'Generating response...';
              }
              // Stop the scheduled thinking text updates
              cancelThinkingText(s.aiNode);
            } else {
              // If no thinking container exists, clear normally
              textDiv.innerHTML = "";
            }
          }
          hideLoader();
        }
      }

      if (s.aiNode && document.contains(s.aiNode)) {
        const div = s.aiNode.querySelector(".message-text");
        if (div && !div.__seededOnce && s.session.messages[s.messageIndex]?.[1]) {
          const seed = s.session.messages[s.messageIndex][1];
          if (seed) {
            const userSetting = state.settings.streamThrottling || "auto";
            if (userSetting === "none") {
              // Synchronous seeding for No Throttling
              div.innerHTML = mdFallback(seed);
              div.__seededOnce = true;
            } else {
              // Async seeding for other settings
              md(seed).then(html => {
                div.innerHTML = html;
                div.__seededOnce = true;
              }).catch(err => {
                console.warn('Markdown seeding error:', err);
                div.innerHTML = mdFallback(seed);
                div.__seededOnce = true;
              });
            }
            fullResponse = seed;
          }
        }
      }

      fullResponse += String(token);
      const gotEnd = END_RX.test(fullResponse);
      if (gotEnd) sawEnd = true;

      if (s.aiNode && document.contains(s.aiNode)) {
        const div = s.aiNode.querySelector(".message-text");
        if (div) {
          const prevHeight = div.scrollHeight;
          const display = trimEnd(fullResponse);
          
          // PERFORMANCE: Track last rendered length for incremental updates
          if (!div._lastRenderedLength) {
            div._lastRenderedLength = 0;
          }
          
          const userSetting = state.settings.streamThrottling || "auto";
          
          // FAST PATH for No Throttling - bypass all complex logic
          if (userSetting === "none") {
            
            // Remove thinking container immediately if exists
            const thinkingContainer = div.querySelector('.thinking-container');
            if (thinkingContainer && display.trim().length > 0 && thinkingContainer.parentNode) {
              thinkingContainer.parentNode.removeChild(thinkingContainer);
            }
            
            // SMART RENDERING: Use incremental append for large chunks to prevent flashing
            const newContent = display.substring(div._lastRenderedLength);
            const isInitialRender = div._lastRenderedLength === 0;
            const isSmallIncrement = newContent.length < 100;
            
            if (isInitialRender) {
              // Initial render - parse markdown fully
              const html = mdFallback(display);
              div.innerHTML = html;
            } else if (isSmallIncrement) {
              // Small increment - full re-render (maintains markdown context)
              const html = mdFallback(display);
              div.innerHTML = html;
            } else {
              // Incremental append for large chunks (prevents flashing)
              const html = mdFallback(newContent);
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = html;
              while (tempDiv.firstChild) {
                div.appendChild(tempDiv.firstChild);
              }
            }
            
            div._lastRenderedLength = display.length;
            
            if (div.querySelector("pre code")) highlightAllUnder(div);
            renderMathInElement(div);
            
            debouncedAIScrollToBottom();
            
            if (gotEnd) finalize();
            return;
          }
          
          // For other settings (not "none"), handle thinking container with animation
          const thinkingContainer = div.querySelector('.thinking-container');
          if (thinkingContainer && display.trim().length > 0) {
            thinkingContainer.style.opacity = '0';
            thinkingContainer.style.transition = 'opacity 0.3s ease-out';
            setTimeout(() => {
              if (thinkingContainer.parentNode) {
                thinkingContainer.parentNode.removeChild(thinkingContainer);
              }
            }, 300);
          }
          
          // Smart throttled rendering with progressive worker adoption
          const performSmartRender = () => {
            const now = Date.now();
            const contentGrowth = display.length - lastRenderLength;
            const timeSinceLastRender = now - lastRenderTime;
            
            const userSetting = state.settings.streamThrottling || "auto";
            if (userSetting === "none") {
            }
            
            // Decision matrix for rendering strategy
            const shouldUseWorkerForStreaming = userSetting !== "none" && (
              display.length > 3000 || 
              (display.match(/```/g) || []).length > 3 ||
              /\$\$[\s\S]*?\$\$/.test(display)
            );
            
            // Get user's throttling preference
            const getThrottleMs = () => {
              switch (userSetting) {
                case "none":
                  return 0; // No throttling - maximum speed
                case "high":
                  return 10; // High performance
                case "medium":
                  return 50; // Medium performance
                case "low":
                  return 100; // Low performance
                case "minimal":
                  return 150; // Minimal performance
                case "auto":
                default:
                  // Auto-adaptive based on content
                  if (shouldUseWorkerForStreaming) {
                    return 150; // Slower for worker processing
                  } else if (display.length > 1500) {
                    return 100; // Medium throttle for medium content
                  } else {
                    return 50; // Base throttle
                  }
              }
            };

            // Adaptive throttling based on user setting and content
            let throttleMs = getThrottleMs();
            if (shouldUseWorkerForStreaming) {
              isUsingWorker = true;
            }
            
            // Adjust content growth threshold based on user setting
            const getContentGrowthThreshold = () => {
              switch (userSetting) {
                case "none":
                  return 1; // Minimal threshold - render every single character
                case "high":
                  return 10; // Lower threshold for faster updates
                case "medium":
                  return 30; // Medium threshold
                case "low":
                  return 50; // Higher threshold
                case "minimal":
                  return 80; // Highest threshold
                case "auto":
                default:
                  return 50; // Default threshold
              }
            };

            const contentGrowthThreshold = getContentGrowthThreshold();
            
            // Skip render if throttling and no significant change (but never skip for "none" setting)
            if (userSetting !== "none" && timeSinceLastRender < throttleMs && contentGrowth < contentGrowthThreshold && !gotEnd) {
              return;
            }
            
            lastRenderTime = now;
            lastRenderLength = display.length;
            
            if (isUsingWorker && !shouldUseWorkerForStreaming) {
              isUsingWorker = false;
            } else if (!isUsingWorker && shouldUseWorkerForStreaming) {
            }
            
            // Note: "none" throttling is handled by fast path above, this code only runs for other settings
            {
              // SMART RENDERING: Determine if we should append or replace
              const newContent = display.substring(div._lastRenderedLength || 0);
              const isInitialRender = (div._lastRenderedLength || 0) === 0;
              const isSmallIncrement = newContent.length < 100;
              const shouldFullRender = isInitialRender || isSmallIncrement || gotEnd;
              
              if (shouldFullRender) {
                // Full re-render (for initial, small chunks, or final render)
                md(display, { 
                  isStreaming: true,
                  forceWorker: shouldUseWorkerForStreaming,
                  forceSync: !shouldUseWorkerForStreaming && display.length < 1000
                }).then(html => {
                  div.innerHTML = html;
                  div._lastRenderedLength = display.length;
                  if (div.querySelector("pre code")) highlightAllUnder(div);
                  renderMathInElement(div);
                  
                  requestAnimationFrame(() => {
                    scrollToBottom({ fromAI: true });
                  });
                }).catch(err => {
                  console.warn('Markdown rendering error:', err);
                  div.innerHTML = mdFallback(display);
                  div._lastRenderedLength = display.length;
                  if (div.querySelector("pre code")) highlightAllUnder(div);
                  renderMathInElement(div);
                  
                  requestAnimationFrame(() => {
                    scrollToBottom({ fromAI: true });
                  });
                });
              } else {
                // Incremental append for large chunks (prevents flashing)
                md(newContent, { 
                  isStreaming: true,
                  forceSync: true
                }).then(html => {
                  const tempDiv = document.createElement('div');
                  tempDiv.innerHTML = html;
                  while (tempDiv.firstChild) {
                    div.appendChild(tempDiv.firstChild);
                  }
                  div._lastRenderedLength = display.length;
                  if (div.querySelector("pre code")) highlightAllUnder(div);
                  renderMathInElement(div);
                  
                  requestAnimationFrame(() => {
                    scrollToBottom({ fromAI: true });
                  });
                }).catch(err => {
                  console.warn('Markdown rendering error in append:', err);
                  // Fallback to full render on error
                  div.innerHTML = mdFallback(display);
                  div._lastRenderedLength = display.length;
                  if (div.querySelector("pre code")) highlightAllUnder(div);
                  renderMathInElement(div);
                  
                  requestAnimationFrame(() => {
                    scrollToBottom({ fromAI: true });
                  });
                });
              }
            }
          };
          
          // Execute smart rendering
          if (gotEnd) {
            // Final render - no throttling
            clearTimeout(renderTimeout);
            performSmartRender();
          } else {
            // Throttled streaming render based on user setting
            clearTimeout(renderTimeout);
            if (userSetting === "none") {
              // No throttling - render immediately
              performSmartRender();
            } else {
              // Use minimal delay for other settings
              renderTimeout = setTimeout(performSmartRender, 1);
            }
          }

          // Height checking moved inside the rendering promise to avoid race conditions
          // The autoscroll is now handled directly in the .then() callback above
        }
      }

      s.fullResponse = fullResponse;
      s.sawEnd = sawEnd;
      s.lastActivity = Date.now();

      if (gotEnd) finalize();
    };
  }


  window.createStreamHandler = createStreamHandler;
})();
