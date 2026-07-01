// ==UserScript==
// @name         Razorbeam Filter Evade
// @namespace    https://github.com/RazorbeamCollectibles
// @version      1.0.2
// @description  Converts selected Latin glyphs to non-Latin lookalikes before posting on supported sites.
// @author       Razorbeam Collectibles
// @match        https://x.com/*
// @match        https://twitter.com/*
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @match        https://www.instagram.com/*
// @match        https://instagram.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    "use strict";

    if (window.top !== window.self) {
        return;
    }

    const HOST_KEY = `enabled:${location.hostname}`;
    const POS_KEY = `pill-position:${location.hostname}`;
    const MAP = Object.freeze({
        a: "\u0430",
        A: "\u0410",
        c: "\u0441",
        C: "\u0421",
        e: "\u0435",
        E: "\u0415",
        i: "\u0456",
        I: "\u0406",
        j: "\u0458",
        J: "\u0408",
        o: "\u043e",
        O: "\u041e",
        p: "\u0440",
        P: "\u0420",
        s: "\u0455",
        S: "\u0405",
        u: "\u057d",
        U: "\u054d",
        x: "\u0445",
        X: "\u0425",
    });

    let enabled = GM_getValue(HOST_KEY, true);
    let lastEditor = null;
    let toggleButton = null;
    let suppressToggleClick = false;
    let flashTimer = null;
    const replayState = new WeakMap();
    const internalEdit = new WeakSet();

    function convertText(text) {
        return String(text || "").replace(/[aAceEiIjJoOpPsSuUxX]/g, (char) => MAP[char] || char);
    }

    function isEditableElement(element) {
        if (!(element instanceof HTMLElement)) {
            return false;
        }
        if (element.isContentEditable) {
            return true;
        }
        if (element instanceof HTMLTextAreaElement) {
            return true;
        }
        if (element instanceof HTMLInputElement) {
            const type = (element.type || "text").toLowerCase();
            return ["text", "search", "url"].includes(type);
        }
        return element.getAttribute("role") === "textbox";
    }

    function closestEditable(start) {
        if (!(start instanceof Element)) {
            return null;
        }
        if (isEditableElement(start)) {
            return start;
        }
        return start.closest('[contenteditable="true"], textarea, input[type="text"], input[type="search"], input[type="url"], [role="textbox"]');
    }

    function visible(element) {
        if (!(element instanceof HTMLElement)) {
            return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function textOf(editor) {
        if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
            return editor.value;
        }
        return editor.innerText || editor.textContent || "";
    }

    function normalizedLabel(element) {
        if (!(element instanceof Element)) {
            return "";
        }
        return `${element.getAttribute("aria-label") || ""} ${element.innerText || element.textContent || ""}`
            .replace(/\s+/g, " ")
            .trim();
    }

    function disabled(element) {
        return Boolean(element?.disabled) || element?.getAttribute?.("aria-disabled") === "true";
    }

    function eventPathElements(element) {
        const path = [];
        let node = element instanceof Element ? element : null;
        for (let depth = 0; node && node !== document.body && depth < 12; depth += 1, node = node.parentElement) {
            path.push(node);
        }
        return path;
    }

    function labeledControl(element, pattern) {
        for (const node of eventPathElements(element)) {
            if (disabled(node)) {
                continue;
            }
            const tag = node.tagName.toLowerCase();
            const buttonLike = tag === "button" || tag === "a" || node.getAttribute("role") === "button";
            const textControl = tag === "div" || tag === "span";
            const aria = (node.getAttribute("aria-label") || "").trim();
            const text = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
            if ((buttonLike || textControl) && (pattern.test(aria) || pattern.test(text) || pattern.test(normalizedLabel(node)))) {
                return node;
            }
        }
        return null;
    }

    function setInputValue(editor, value) {
        internalEdit.add(editor);
        const proto = editor instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) {
            setter.call(editor, value);
        } else {
            editor.value = value;
        }
        editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
        editor.dispatchEvent(new Event("change", { bubbles: true }));
        window.setTimeout(() => internalEdit.delete(editor), 0);
    }

    function setContentEditableValue(editor, value) {
        internalEdit.add(editor);
        editor.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        selection.removeAllRanges();
        selection.addRange(range);

        let inserted = false;
        try {
            inserted = document.execCommand("insertText", false, value);
        } catch (_error) {
            inserted = false;
        }
        if (!inserted) {
            editor.textContent = value;
            editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
        }
        editor.dispatchEvent(new Event("change", { bubbles: true }));
        window.setTimeout(() => internalEdit.delete(editor), 0);
    }

    function dispatchEditorInput(editor, inputType, data) {
        try {
            editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType, data }));
        } catch (_error) {
            editor.dispatchEvent(new Event("input", { bubbles: true }));
        }
    }

    function insertInputText(editor, value) {
        const start = editor.selectionStart ?? editor.value.length;
        const end = editor.selectionEnd ?? start;
        internalEdit.add(editor);
        editor.setRangeText(value, start, end, "end");
        dispatchEditorInput(editor, "insertText", value);
        window.setTimeout(() => internalEdit.delete(editor), 0);
    }

    function insertContentEditableText(editor, value) {
        internalEdit.add(editor);
        editor.focus();

        let inserted = false;
        try {
            inserted = document.execCommand("insertText", false, value);
        } catch (_error) {
            inserted = false;
        }

        if (!inserted) {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                const node = document.createTextNode(value);
                range.insertNode(node);
                range.setStartAfter(node);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            } else {
                editor.appendChild(document.createTextNode(value));
            }
            dispatchEditorInput(editor, "insertText", value);
        }

        window.setTimeout(() => internalEdit.delete(editor), 0);
    }

    function insertConvertedText(editor, value) {
        if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
            insertInputText(editor, value);
        } else {
            insertContentEditableText(editor, value);
        }
        lastEditor = editor;
    }

    function convertEditor(editor) {
        if (!editor || !isEditableElement(editor) || !visible(editor)) {
            return false;
        }
        const original = textOf(editor);
        const converted = convertText(original);
        if (!original || original === converted) {
            return false;
        }
        if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
            setInputValue(editor, converted);
        } else {
            setContentEditableValue(editor, converted);
        }
        lastEditor = editor;
        flashToggle("RBFE CONVERTED");
        return true;
    }

    function waitForEditorText(editor, expected, callback) {
        const started = Date.now();
        const timeoutMs = location.hostname.endsWith("instagram.com") ? 900 : 450;

        function check() {
            if (textOf(editor) === expected || Date.now() - started >= timeoutMs) {
                callback(textOf(editor) === expected);
                return;
            }
            window.setTimeout(check, 75);
        }

        window.setTimeout(check, 75);
    }

    function convertBeforeInput(event) {
        const editor = closestEditable(event.target);
        if (editor && !internalEdit.has(editor)) {
            lastEditor = editor;
        }
    }

    function convertPaste(event) {
        const editor = closestEditable(event.target);
        if (editor && !internalEdit.has(editor)) {
            lastEditor = editor;
        }
    }

    function instagramLiveBeforeInput(event) {
        if (!enabled || !location.hostname.endsWith("instagram.com") || internalEdit.has(event.target)) {
            return;
        }
        if (!["insertText", "insertCompositionText"].includes(event.inputType) || !event.data) {
            return;
        }
        const editor = closestEditable(event.target);
        const converted = convertText(event.data);
        if (!editor || converted === event.data) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        insertConvertedText(editor, converted);
    }

    function instagramPaste(event) {
        if (!enabled || !location.hostname.endsWith("instagram.com") || internalEdit.has(event.target)) {
            return;
        }
        const editor = closestEditable(event.target);
        const text = event.clipboardData?.getData("text/plain") || "";
        const converted = convertText(text);
        if (!editor || !text || converted === text) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        insertConvertedText(editor, converted);
    }

    function editorCandidates() {
        const selectors = [
            '[data-testid="tweetTextarea_0"]',
            '#contenteditable-root[aria-label*="comment" i]',
            '[aria-label*="comment" i][contenteditable="true"]',
            '[aria-label*="reply" i][contenteditable="true"]',
            '[contenteditable="true"]',
            'textarea',
            'input[type="text"]',
            'input[type="url"]',
            '[role="textbox"]',
        ];
        return Array.from(document.querySelectorAll(selectors.join(", ")))
            .filter((element) => isEditableElement(element) && visible(element) && textOf(element).trim());
    }

    function bestEditorNear(target) {
        const localEditor = closestEditable(target);
        if (localEditor) {
            return localEditor;
        }
        if (lastEditor && document.contains(lastEditor) && visible(lastEditor)) {
            return lastEditor;
        }
        const candidates = editorCandidates();
        return candidates[candidates.length - 1] || null;
    }

    function twitterSubmitButton(element) {
        const button = element?.closest?.('[role="button"], button');
        if (!button) {
            return null;
        }
        const testId = button.getAttribute("data-testid") || "";
        if (testId === "tweetButton" || testId === "tweetButtonInline") {
            return button;
        }
        return labeledControl(element, /^(post|tweet|reply)$/i);
    }

    function youtubeSubmitButton(element) {
        return labeledControl(element, /^(comment|reply)$/i);
    }

    function instagramSubmitButton(element) {
        return labeledControl(element, /^(post|reply|send)$/i);
    }

    function submitButton(element) {
        if (location.hostname.endsWith("x.com") || location.hostname.endsWith("twitter.com")) {
            return twitterSubmitButton(element);
        }
        if (location.hostname.endsWith("youtube.com")) {
            return youtubeSubmitButton(element);
        }
        if (location.hostname.endsWith("instagram.com")) {
            return instagramSubmitButton(element);
        }
        return null;
    }

    function convertOnTrustedPress(event) {
        if (
            !enabled
            || location.hostname.endsWith("instagram.com")
            || location.hostname.endsWith("x.com")
            || location.hostname.endsWith("twitter.com")
        ) {
            return;
        }
        const button = submitButton(event.target);
        if (!button) {
            return;
        }
        const editor = bestEditorNear(event.target);
        if (!editor) {
            return;
        }
        convertEditor(editor);
    }

    function convertBeforeSubmit(event) {
        if (!enabled) {
            return;
        }
        const button = submitButton(event.target);
        if (!button) {
            return;
        }
        const state = replayState.get(button);
        if (state?.allowed) {
            state.consumed = true;
            replayState.delete(button);
            return;
        }
        const editor = bestEditorNear(event.target);
        if (!editor) {
            return;
        }
        const expected = convertText(textOf(editor));
        if (location.hostname.endsWith("instagram.com")) {
            if (textOf(editor) !== expected) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                flashToggle("RBFE BLOCKED");
            }
            return;
        }
        const converted = convertEditor(editor);
        if (!converted) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const replay = { allowed: true, consumed: false };
        replayState.set(button, replay);
        waitForEditorText(editor, expected, (verified) => {
            if (replay.consumed || replayState.get(button) !== replay) {
                return;
            }
            if (!verified && location.hostname.endsWith("instagram.com")) {
                replayState.delete(button);
                flashToggle("RBFE BLOCKED");
                return;
            }
            if (document.contains(button)) {
                button.click();
            }
        });
    }

    function trackFocusedEditor(event) {
        const editor = closestEditable(event.target);
        if (editor) {
            lastEditor = editor;
        }
    }

    function toggleEnabled() {
        enabled = !enabled;
        GM_setValue(HOST_KEY, enabled);
        renderToggle();
    }

    function clampPillPosition(x, y) {
        const margin = 8;
        const rect = toggleButton?.getBoundingClientRect();
        const width = rect?.width || 80;
        const height = rect?.height || 32;
        return {
            x: Math.max(margin, Math.min(window.innerWidth - width - margin, x)),
            y: Math.max(margin, Math.min(window.innerHeight - height - margin, y)),
        };
    }

    function applySavedPillPosition() {
        const saved = GM_getValue(POS_KEY, null);
        if (!saved || typeof saved.x !== "number" || typeof saved.y !== "number") {
            toggleButton.style.left = "12px";
            toggleButton.style.right = "auto";
            toggleButton.style.top = "auto";
            toggleButton.style.bottom = "12px";
            return;
        }
        const pos = clampPillPosition(saved.x, saved.y);
        toggleButton.style.left = `${pos.x}px`;
        toggleButton.style.top = `${pos.y}px`;
        toggleButton.style.right = "auto";
        toggleButton.style.bottom = "auto";
    }

    function savePillPosition() {
        const rect = toggleButton.getBoundingClientRect();
        const pos = clampPillPosition(rect.left, rect.top);
        GM_setValue(POS_KEY, pos);
        applySavedPillPosition();
    }

    function startPillDrag(event) {
        if (event.button !== 0) {
            return;
        }
        event.stopPropagation();
        const rect = toggleButton.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const offsetX = startX - rect.left;
        const offsetY = startY - rect.top;
        let moved = false;

        toggleButton.setPointerCapture?.(event.pointerId);
        toggleButton.style.cursor = "grabbing";

        function movePill(moveEvent) {
            const dx = Math.abs(moveEvent.clientX - startX);
            const dy = Math.abs(moveEvent.clientY - startY);
            moved = moved || dx > 3 || dy > 3;
            if (moved) {
                moveEvent.preventDefault();
            }
            const pos = clampPillPosition(moveEvent.clientX - offsetX, moveEvent.clientY - offsetY);
            toggleButton.style.left = `${pos.x}px`;
            toggleButton.style.top = `${pos.y}px`;
            toggleButton.style.right = "auto";
            toggleButton.style.bottom = "auto";
        }

        function stopDrag(endEvent) {
            window.removeEventListener("pointermove", movePill, true);
            window.removeEventListener("pointerup", stopDrag, true);
            window.removeEventListener("pointercancel", stopDrag, true);
            try {
                toggleButton.releasePointerCapture?.(event.pointerId);
            } catch (_error) {
                // Pointer capture can already be gone in Firefox-family browsers.
            }
            toggleButton.style.cursor = "grab";
            if (moved) {
                suppressToggleClick = true;
                savePillPosition();
                window.setTimeout(() => {
                    suppressToggleClick = false;
                }, 160);
            } else if (endEvent.type === "pointerup") {
                suppressToggleClick = true;
                toggleEnabled();
                endEvent.preventDefault();
                endEvent.stopPropagation();
                window.setTimeout(() => {
                    suppressToggleClick = false;
                }, 160);
            }
        }

        window.addEventListener("pointermove", movePill, true);
        window.addEventListener("pointerup", stopDrag, true);
        window.addEventListener("pointercancel", stopDrag, true);
    }
    function renderToggle() {
        if (!toggleButton) {
            toggleButton = document.createElement("button");
            toggleButton.type = "button";
            toggleButton.addEventListener("pointerdown", startPillDrag);
            toggleButton.addEventListener("click", (event) => {
                if (suppressToggleClick) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                toggleEnabled();
            });
            Object.assign(toggleButton.style, {
                position: "fixed",
                left: "12px",
                bottom: "12px",
                zIndex: "2147483647",
                border: "1px solid #6802a7",
                borderRadius: "4px",
                padding: "6px 8px",
                font: "12px Segoe UI, Arial, sans-serif",
                fontWeight: "700",
                cursor: "grab",
                userSelect: "none",
                touchAction: "none",
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.35)",
            });
            document.documentElement.appendChild(toggleButton);
            window.setTimeout(applySavedPillPosition, 0);
        }
        toggleButton.textContent = enabled ? "RBFE ON" : "RBFE OFF";
        toggleButton.title = enabled ? "Razorbeam Filter Evade enabled for this site" : "Razorbeam Filter Evade disabled for this site";
        toggleButton.style.background = enabled ? "#6802a7" : "#202020";
        toggleButton.style.color = "#ffffff";
    }

    function flashToggle(text) {
        if (!toggleButton) {
            return;
        }
        if (flashTimer) {
            window.clearTimeout(flashTimer);
        }
        toggleButton.textContent = text;
        toggleButton.style.background = "#911bff";
        flashTimer = window.setTimeout(() => {
            flashTimer = null;
            renderToggle();
        }, 900);
    }

    function convertFocusedNow() {
        if (enabled) {
            convertEditor(bestEditorNear(document.activeElement));
        }
    }

    if (typeof GM_registerMenuCommand === "function") {
        GM_registerMenuCommand("Toggle Razorbeam Filter Evade for this site", toggleEnabled);
        GM_registerMenuCommand("Convert focused editor now", convertFocusedNow);
    }

    document.addEventListener("focusin", trackFocusedEditor, true);
    document.addEventListener("beforeinput", instagramLiveBeforeInput, true);
    document.addEventListener("beforeinput", convertBeforeInput, true);
    document.addEventListener("paste", instagramPaste, true);
    document.addEventListener("paste", convertPaste, true);
    document.addEventListener("drop", trackFocusedEditor, true);
    document.addEventListener("pointerdown", convertOnTrustedPress, true);
    document.addEventListener("click", convertBeforeSubmit, true);
    document.addEventListener("keydown", (event) => {
        if (!enabled) {
            return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            convertEditor(bestEditorNear(event.target));
        }
        if (event.altKey && event.key.toLowerCase() === "g") {
            convertEditor(bestEditorNear(event.target));
            event.preventDefault();
        }
    }, true);

    renderToggle();
})();


