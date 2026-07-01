// ==UserScript==
// @name         Razorbeam Filter Evade
// @namespace    https://github.com/RazorbeamCollectibles
// @version      1.0.11
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

    const SCRIPT_KEY = "__razorbeamFilterEvadeTwitterStable";
    const PILL_ID = "razorbeam-filter-evade-pill";
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

    if (window[SCRIPT_KEY]) {
        document.getElementById(PILL_ID)?.remove();
        return;
    }
    window[SCRIPT_KEY] = true;

    let enabled = GM_getValue(HOST_KEY, true);
    let pill = null;
    let lastEditor = null;
    let flashTimer = null;
    let suppressClick = false;
    const replayState = new WeakMap();
    const internalEdit = new WeakSet();

    function isTwitterHost() {
        return location.hostname.endsWith("x.com") || location.hostname.endsWith("twitter.com");
    }

    function isInstagramHost() {
        return location.hostname.endsWith("instagram.com");
    }

    function isYoutubeHost() {
        return location.hostname.endsWith("youtube.com");
    }

    function convertText(text) {
        return String(text || "").replace(/[aAceEiIjJoOpPsSuUxX]/g, (char) => MAP[char] || char);
    }

    function isEditable(element) {
        if (!(element instanceof HTMLElement)) {
            return false;
        }
        if (element.isContentEditable || element.getAttribute("role") === "textbox") {
            return true;
        }
        if (element instanceof HTMLTextAreaElement) {
            return true;
        }
        if (element instanceof HTMLInputElement) {
            const type = (element.type || "text").toLowerCase();
            return ["text", "search", "url"].includes(type);
        }
        return false;
    }

    function closestEditor(start) {
        if (!(start instanceof Element)) {
            return null;
        }
        if (isEditable(start)) {
            return start;
        }
        return start.closest('[data-testid="tweetTextarea_0"], [contenteditable="true"], [role="textbox"], textarea, input[type="text"], input[type="search"], input[type="url"]');
    }

    function isVisible(element) {
        if (!(element instanceof HTMLElement)) {
            return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function editorText(editor) {
        if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
            return editor.value || "";
        }
        return editor?.innerText || editor?.textContent || "";
    }

    function findEditors() {
        return Array.from(document.querySelectorAll('[data-testid="tweetTextarea_0"], #contenteditable-root[aria-label*="comment" i], [aria-label*="comment" i][contenteditable="true"], [aria-label*="reply" i][contenteditable="true"], [contenteditable="true"], [role="textbox"], textarea, input[type="text"], input[type="url"]'))
            .filter((element) => isEditable(element) && isVisible(element));
    }

    function bestEditor(target) {
        const direct = closestEditor(target);
        if (direct && isVisible(direct)) {
            return direct;
        }
        if (lastEditor && document.contains(lastEditor) && isVisible(lastEditor)) {
            return lastEditor;
        }
        const editors = findEditors().filter((editor) => editorText(editor).trim());
        return editors[editors.length - 1] || null;
    }

    function dispatchInput(editor, inputType, data) {
        try {
            editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType, data }));
        } catch (_error) {
            editor.dispatchEvent(new Event("input", { bubbles: true }));
        }
    }

    function pulseEditorState(editor) {
        if (!editor) {
            return;
        }
        dispatchInput(editor, "insertText", null);
        editor.dispatchEvent(new Event("change", { bubbles: true }));
        editor.dispatchEvent(new KeyboardEvent("keyup", {
            bubbles: true,
            cancelable: true,
            key: " ",
            code: "Space",
        }));
    }

    function scheduleStatePulses(editor) {
        pulseEditorState(editor);
        window.setTimeout(() => pulseEditorState(editor), 80);
        window.setTimeout(() => pulseEditorState(editor), 220);
    }

    function insertConvertedAtSelection(editor, text) {
        internalEdit.add(editor);
        editor.focus();

        let inserted = false;
        try {
            inserted = document.execCommand("insertText", false, text);
        } catch (_error) {
            inserted = false;
        }

        if (!inserted) {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                const node = document.createTextNode(text);
                range.insertNode(node);
                range.setStartAfter(node);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            } else {
                editor.appendChild(document.createTextNode(text));
            }
            dispatchInput(editor, "insertText", text);
        }

        lastEditor = editor;
        window.setTimeout(() => internalEdit.delete(editor), 0);
    }

    function insertInputText(editor, value) {
        const start = editor.selectionStart ?? editor.value.length;
        const end = editor.selectionEnd ?? start;
        internalEdit.add(editor);
        editor.setRangeText(value, start, end, "end");
        dispatchInput(editor, "insertText", value);
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
            dispatchInput(editor, "insertText", value);
        }

        window.setTimeout(() => internalEdit.delete(editor), 0);
    }

    function insertInstagramConvertedText(editor, value) {
        if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
            insertInputText(editor, value);
        } else {
            insertContentEditableText(editor, value);
        }
        lastEditor = editor;
    }

    function replaceWholeEditor(editor, text) {
        internalEdit.add(editor);
        editor.focus();

        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        selection.removeAllRanges();
        selection.addRange(range);

        let inserted = false;
        try {
            inserted = document.execCommand("insertText", false, text);
        } catch (_error) {
            inserted = false;
        }

        if (!inserted) {
            editor.textContent = text;
            dispatchInput(editor, "insertText", text);
        }

        scheduleStatePulses(editor);
        lastEditor = editor;
        window.setTimeout(() => internalEdit.delete(editor), 0);
    }

    function convertEditor(editor) {
        if (!enabled || !editor || !isVisible(editor)) {
            return false;
        }
        const original = editorText(editor);
        const converted = convertText(original);
        if (!original || original === converted) {
            return false;
        }
        replaceWholeEditor(editor, converted);
        flashPill("RBFE CONVERTED");
        return true;
    }

    function handleBeforeInput(event) {
        if (!enabled || !isTwitterHost() || internalEdit.has(event.target)) {
            return;
        }
        const editor = closestEditor(event.target);
        if (editor) {
            lastEditor = editor;
        }
        if (!editor || !["insertText", "insertCompositionText"].includes(event.inputType) || !event.data) {
            return;
        }

        const converted = convertText(event.data);
        if (converted === event.data) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        insertConvertedAtSelection(editor, converted);
    }

    function handlePaste(event) {
        if (!enabled || !isTwitterHost() || internalEdit.has(event.target)) {
            return;
        }
        const editor = closestEditor(event.target);
        if (editor) {
            lastEditor = editor;
        }
        const text = event.clipboardData?.getData("text/plain") || "";
        const converted = convertText(text);
        if (!editor || !text || converted === text) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        insertConvertedAtSelection(editor, converted);
        flashPill("RBFE PASTED");
    }

    function trackEditor(event) {
        const editor = closestEditor(event.target);
        if (editor) {
            lastEditor = editor;
        }
    }

    function submitButton(target) {
        const button = target?.closest?.('[role="button"], button');
        if (!button) {
            return null;
        }

        const testId = button.getAttribute("data-testid") || "";
        if (testId === "tweetButton" || testId === "tweetButtonInline") {
            return button;
        }

        const label = `${button.getAttribute("aria-label") || ""} ${button.innerText || button.textContent || ""}`
            .replace(/\s+/g, " ")
            .trim();
        return /^(post|tweet|reply)$/i.test(label) ? button : null;
    }

    function handleSubmitPress(event) {
        if (!enabled || !isTwitterHost()) {
            return;
        }
        const button = submitButton(event.target);
        if (!button) {
            return;
        }
        convertEditor(bestEditor(event.target));
    }

    function handleSubmitClick(event) {
        if (!enabled || !isTwitterHost()) {
            return;
        }
        const button = submitButton(event.target);
        if (!button) {
            return;
        }

        const editor = bestEditor(event.target);
        const converted = convertEditor(editor);
        if (!converted) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        window.setTimeout(() => {
            if (document.contains(button)) {
                button.click();
            }
        }, 450);
    }

    function eventPathElements(element) {
        const path = [];
        let node = element instanceof Element ? element : null;
        for (let depth = 0; node && node !== document.body && depth < 12; depth += 1, node = node.parentElement) {
            path.push(node);
        }
        return path;
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

    function nonTwitterSubmitButton(element) {
        if (isYoutubeHost()) {
            return labeledControl(element, /^(comment|reply)$/i);
        }
        if (isInstagramHost()) {
            return labeledControl(element, /^(post|reply|send)$/i);
        }
        return null;
    }

    function waitForEditorText(editor, expected, callback) {
        const started = Date.now();
        const timeoutMs = isInstagramHost() ? 900 : 450;

        function check() {
            if (editorText(editor) === expected || Date.now() - started >= timeoutMs) {
                callback(editorText(editor) === expected);
                return;
            }
            window.setTimeout(check, 75);
        }

        window.setTimeout(check, 75);
    }

    function instagramLiveBeforeInput(event) {
        if (!enabled || !isInstagramHost() || internalEdit.has(event.target)) {
            return;
        }
        if (!["insertText", "insertCompositionText"].includes(event.inputType) || !event.data) {
            return;
        }
        const editor = closestEditor(event.target);
        const converted = convertText(event.data);
        if (!editor || converted === event.data) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        insertInstagramConvertedText(editor, converted);
    }

    function instagramPaste(event) {
        if (!enabled || !isInstagramHost() || internalEdit.has(event.target)) {
            return;
        }
        const editor = closestEditor(event.target);
        const text = event.clipboardData?.getData("text/plain") || "";
        const converted = convertText(text);
        if (!editor || !text || converted === text) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        insertInstagramConvertedText(editor, converted);
    }

    function nonTwitterSubmitClick(event) {
        if (!enabled || isTwitterHost()) {
            return;
        }
        const button = nonTwitterSubmitButton(event.target);
        if (!button) {
            return;
        }
        const state = replayState.get(button);
        if (state?.allowed) {
            state.consumed = true;
            replayState.delete(button);
            return;
        }
        const editor = bestEditor(event.target);
        if (!editor) {
            return;
        }
        const expected = convertText(editorText(editor));
        if (isInstagramHost()) {
            if (editorText(editor) !== expected) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                flashPill("RBFE BLOCKED");
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
        waitForEditorText(editor, expected, () => {
            if (replay.consumed || replayState.get(button) !== replay) {
                return;
            }
            if (document.contains(button)) {
                button.click();
            }
        });
    }

    function toggleEnabled() {
        enabled = !enabled;
        GM_setValue(HOST_KEY, enabled);
        renderPill();
    }

    function clampPosition(x, y) {
        const margin = 8;
        const rect = pill?.getBoundingClientRect();
        const width = rect?.width || 78;
        const height = rect?.height || 30;
        return {
            x: Math.max(margin, Math.min(window.innerWidth - width - margin, x)),
            y: Math.max(margin, Math.min(window.innerHeight - height - margin, y)),
        };
    }

    function applySavedPosition() {
        const saved = GM_getValue(POS_KEY, null);
        if (!saved || typeof saved.x !== "number" || typeof saved.y !== "number") {
            pill.style.left = "12px";
            pill.style.right = "auto";
            pill.style.top = "auto";
            pill.style.bottom = "12px";
            return;
        }

        const pos = clampPosition(saved.x, saved.y);
        pill.style.left = `${pos.x}px`;
        pill.style.top = `${pos.y}px`;
        pill.style.right = "auto";
        pill.style.bottom = "auto";
    }

    function savePosition() {
        const rect = pill.getBoundingClientRect();
        GM_setValue(POS_KEY, clampPosition(rect.left, rect.top));
        applySavedPosition();
    }

    function startDrag(event) {
        if (event.button !== 0) {
            return;
        }

        event.stopPropagation();
        const rect = pill.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const offsetX = startX - rect.left;
        const offsetY = startY - rect.top;
        let moved = false;

        pill.setPointerCapture?.(event.pointerId);
        pill.style.cursor = "grabbing";

        function move(moveEvent) {
            const dx = Math.abs(moveEvent.clientX - startX);
            const dy = Math.abs(moveEvent.clientY - startY);
            moved = moved || dx > 3 || dy > 3;
            if (moved) {
                moveEvent.preventDefault();
            }
            const pos = clampPosition(moveEvent.clientX - offsetX, moveEvent.clientY - offsetY);
            pill.style.left = `${pos.x}px`;
            pill.style.top = `${pos.y}px`;
            pill.style.right = "auto";
            pill.style.bottom = "auto";
        }

        function stop(stopEvent) {
            window.removeEventListener("pointermove", move, true);
            window.removeEventListener("pointerup", stop, true);
            window.removeEventListener("pointercancel", stop, true);
            try {
                pill.releasePointerCapture?.(event.pointerId);
            } catch (_error) {
                // Firefox can release capture before this handler runs.
            }
            pill.style.cursor = "grab";

            suppressClick = true;
            if (moved) {
                savePosition();
            } else if (stopEvent.type === "pointerup") {
                toggleEnabled();
                stopEvent.preventDefault();
                stopEvent.stopPropagation();
            }
            window.setTimeout(() => {
                suppressClick = false;
            }, 160);
        }

        window.addEventListener("pointermove", move, true);
        window.addEventListener("pointerup", stop, true);
        window.addEventListener("pointercancel", stop, true);
    }

    function renderPill() {
        if (!pill) {
            document.getElementById(PILL_ID)?.remove();
            pill = document.createElement("button");
            pill.id = PILL_ID;
            pill.type = "button";
            pill.addEventListener("pointerdown", startDrag);
            pill.addEventListener("click", (event) => {
                if (suppressClick) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                toggleEnabled();
            });

            Object.assign(pill.style, {
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
            document.documentElement.appendChild(pill);
            window.setTimeout(applySavedPosition, 0);
        }

        pill.textContent = enabled ? "RBFE ON" : "RBFE OFF";
        pill.title = enabled ? "Razorbeam Filter Evade enabled for this site" : "Razorbeam Filter Evade disabled for this site";
        pill.style.background = enabled ? "#6802a7" : "#202020";
        pill.style.color = "#ffffff";
    }

    function flashPill(text) {
        if (!pill) {
            return;
        }
        if (flashTimer) {
            window.clearTimeout(flashTimer);
        }
        pill.textContent = text;
        pill.style.background = "#911bff";
        flashTimer = window.setTimeout(() => {
            flashTimer = null;
            renderPill();
        }, 850);
    }

    function convertFocusedNow() {
        convertEditor(bestEditor(document.activeElement));
    }

    if (typeof GM_registerMenuCommand === "function") {
        GM_registerMenuCommand("Toggle Razorbeam Filter Evade for this site", toggleEnabled);
        GM_registerMenuCommand("Convert focused editor now", convertFocusedNow);
    }

    document.addEventListener("focusin", trackEditor, true);
    document.addEventListener("pointerdown", trackEditor, true);
    document.addEventListener("beforeinput", instagramLiveBeforeInput, true);
    document.addEventListener("beforeinput", handleBeforeInput, true);
    document.addEventListener("paste", instagramPaste, true);
    document.addEventListener("paste", handlePaste, true);
    document.addEventListener("pointerdown", handleSubmitPress, true);
    document.addEventListener("click", handleSubmitClick, true);
    document.addEventListener("click", nonTwitterSubmitClick, true);
    document.addEventListener("keydown", (event) => {
        if (!enabled) {
            return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            convertEditor(bestEditor(event.target));
        }
        if (event.altKey && event.key.toLowerCase() === "g") {
            convertFocusedNow();
            event.preventDefault();
        }
    }, true);

    renderPill();
})();
