"use strict";
/*!
 * Copyright (c) 2017-present Cliqz GmbH. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.injectScript = exports.autoRemoveScript = exports.DOMMonitor = exports.extractFeaturesFromDOM = void 0;
const SCRIPT_ID = 'cliqz-adblocker-script';
const IGNORED_TAGS = new Set(['br', 'head', 'link', 'meta', 'script', 'style', 's']);
function isElement(node) {
    // https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType#node_type_constants
    return node.nodeType === 1; // Node.ELEMENT_NODE;
}
function getElementsFromMutations(mutations) {
    // Accumulate all nodes which were updated in `nodes`
    const elements = [];
    for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
            if (isElement(mutation.target)) {
                elements.push(mutation.target);
            }
        }
        else if (mutation.type === 'childList') {
            for (const addedNode of mutation.addedNodes) {
                if (isElement(addedNode) && addedNode.id !== SCRIPT_ID) {
                    elements.push(addedNode);
                }
            }
        }
    }
    return elements;
}
/**
 * WARNING: this function should be self-contained and not rely on any global
 * symbol. That constraint needs to be fulfilled because this function can
 * potentially be injected in content-script (e.g.: see PuppeteerBlocker for
 * more details).
 */
function extractFeaturesFromDOM(roots) {
    // NOTE: This cannot be global as puppeteer needs to be able to serialize this function.
    const ignoredTags = new Set(['br', 'head', 'link', 'meta', 'script', 'style', 's']);
    const classes = new Set();
    const hrefs = new Set();
    const ids = new Set();
    for (const root of roots) {
        for (const element of [root, ...root.querySelectorAll('[id],[class],[href]')]) {
            if (ignoredTags.has(element.nodeName.toLowerCase())) {
                continue;
            }
            // Update ids
            const id = element.id;
            if (id) {
                ids.add(id);
            }
            // Update classes
            const classList = element.classList;
            if (classList) {
                for (const cls of classList) {
                    classes.add(cls);
                }
            }
            // Update href
            const href = element.getAttribute('href');
            if (typeof href === 'string') {
                hrefs.add(href);
            }
        }
    }
    return {
        classes: Array.from(classes),
        hrefs: Array.from(hrefs),
        ids: Array.from(ids),
    };
}
exports.extractFeaturesFromDOM = extractFeaturesFromDOM;
class DOMMonitor {
    constructor(cb) {
        this.cb = cb;
        this.knownIds = new Set();
        this.knownHrefs = new Set();
        this.knownClasses = new Set();
        this.observer = null;
    }
    queryAll(window) {
        this.cb({ type: 'elements', elements: [window.document.documentElement] });
        this.handleUpdatedNodes([window.document.documentElement]);
    }
    start(window) {
        if (this.observer === null && window.MutationObserver !== undefined) {
            this.observer = new window.MutationObserver((mutations) => {
                this.handleUpdatedNodes(getElementsFromMutations(mutations));
            });
            this.observer.observe(window.document.documentElement, {
                // Monitor some attributes
                attributes: true,
                attributeFilter: ['class', 'id', 'href'],
                childList: true,
                subtree: true,
            });
        }
    }
    stop() {
        if (this.observer !== null) {
            this.observer.disconnect();
            this.observer = null;
        }
    }
    handleNewFeatures({ hrefs, ids, classes, }) {
        const newIds = [];
        const newClasses = [];
        const newHrefs = [];
        // Update ids
        for (const id of ids) {
            if (this.knownIds.has(id) === false) {
                newIds.push(id);
                this.knownIds.add(id);
            }
        }
        for (const cls of classes) {
            if (this.knownClasses.has(cls) === false) {
                newClasses.push(cls);
                this.knownClasses.add(cls);
            }
        }
        for (const href of hrefs) {
            if (this.knownHrefs.has(href) === false) {
                newHrefs.push(href);
                this.knownHrefs.add(href);
            }
        }
        if (newIds.length !== 0 || newClasses.length !== 0 || newHrefs.length !== 0) {
            this.cb({
                type: 'features',
                classes: newClasses,
                hrefs: newHrefs,
                ids: newIds,
            });
            return true;
        }
        return false;
    }
    handleUpdatedNodes(elements) {
        if (elements.length !== 0) {
            this.cb({
                type: 'elements',
                elements: elements.filter((e) => IGNORED_TAGS.has(e.nodeName.toLowerCase()) === false),
            });
            return this.handleNewFeatures(extractFeaturesFromDOM(elements));
        }
        return false;
    }
}
exports.DOMMonitor = DOMMonitor;
/**
 * Wrap a self-executing script into a block of custom logic to remove the
 * script tag once execution is terminated. This can be useful to not leave
 * traces in the DOM after injections.
 */
function autoRemoveScript(script) {
    // Minified using 'terser'
    return `try{${script}}catch(c){}!function(){var c=document.currentScript,e=c&&c.parentNode;e&&e.removeChild(c)}();`;
    // Original:
    //
    //    try {
    //      ${script}
    //    } catch (ex) { }
    //
    //    (function() {
    //      var currentScript = document.currentScript;
    //      var parent = currentScript && currentScript.parentNode;
    //
    //      if (parent) {
    //        parent.removeChild(currentScript);
    //      }
    //    })();
}
exports.autoRemoveScript = autoRemoveScript;
function injectScript(s, doc) {
    const script = doc.createElement('script');
    script.type = 'text/javascript';
    script.id = SCRIPT_ID;
    script.async = false;
    script.appendChild(doc.createTextNode(autoRemoveScript(s)));
    // Insert node
    const parent = doc.head || doc.documentElement;
    if (parent !== null) {
        parent.appendChild(script);
    }
}
exports.injectScript = injectScript;
//# sourceMappingURL=adblocker.js.map