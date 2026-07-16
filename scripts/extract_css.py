#!/usr/bin/env python3
"""Extract only the CSS rules from ref_App.css that reference any of the modal's
class names. Handles nested at-rules (e.g. @media). Outputs a focused stylesheet."""
import re
import sys

SRC = '/Users/lakshmi.tv/Desktop/Cursor/Clean-up/scripts/ref_App.css'
OUT = '/Users/lakshmi.tv/Desktop/Cursor/Clean-up/src/styles/pages/ReviewMeasuresModal.css'

# Class tokens used by the modal (without leading dot).
TOKENS = [
    'modal-overlay', 'modal-container', 'modal-measures', 'with-panel',
    'modal-header', 'modal-header-simple', 'modal-title', 'modal-close-button',
    'modal-body-simple', 'hierarchies-header-tabs', 'hierarchies-tab',
    'hierarchies-tab-active', 'planning-grid-measure-info-banner',
    'planning-grid-info-banner-link', 'measures-content-wrapper',
    'measures-main-content', 'measures-new-measure-content', 'measures-header',
    'measures-info', 'measures-title', 'measures-count', 'measures-button-group',
    'measures-sparkle-button', 'measures-sync-button', 'button-divider',
    'measures-assign-subset-button', 'measures-create-button', 'measures-filters',
    'filter-field', 'filter-label', 'filter-search', 'filter-select',
    'measures-table-container', 'measures-table', 'table-cell-checkbox',
    'table-cell-actions', 'subsets-cell', 'subsets-display', 'subsets-more',
    'subsets-popover', 'subsets-popover-nubbin', 'subsets-popover-item',
    'editable-cell', 'editable-cell-value', 'editable-cell-placeholder',
    'editable-cell-edit-btn', 'cell-select', 'cell-input', 'dropdown-wrapper',
    'table-row-dropdown', 'dropdown-menu', 'dropdown-menu-item',
    'dropdown-menu-divider', 'dropdown-menu-item-danger', 'measures-table-footer',
    'modal-cancel-button', 'modal-save-button', 'row-selected', 'edit-panel',
    'edit-panel-header', 'edit-panel-title', 'edit-panel-header-actions',
    'edit-panel-text-button', 'edit-panel-cancel-button', 'edit-panel-save-button',
    'edit-panel-delete-button', 'measure-tabs', 'measure-tab', 'measure-tab-active',
    'edit-panel-body', 'measure-section', 'measure-section-title', 'edit-form-field',
    'edit-form-label', 'edit-form-input', 'edit-form-select', 'edit-form-textarea',
    'edit-form-error', 'edit-form-group', 'edit-form-description', 'formula-builder',
    'formula-inputs', 'source-search-wrapper', 'formula-input', 'formula-textarea',
    'check-syntax-button', 'writeback-checkbox-label', 'writeback-checkbox',
    'subsets-tab-content', 'subsets-tab-header', 'subsets-tab-description',
    'subsets-controls', 'subsets-search', 'subsets-toggle', 'toggle-label',
    'toggle-checkbox', 'toggle-text', 'subsets-selected-count', 'subsets-list',
    'subset-item', 'subset-checkbox-label', 'subset-checkbox', 'subset-name',
    'delete-warning', 'delete-measure-details', 'delete-detail-row',
    'delete-detail-label', 'delete-detail-value', 'delete-warning-text',
    'measures-new-measure-breadcrumb', 'ai-breadcrumb', 'planning-view-assign-field',
    'planning-view-assign-label', 'planning-view-role-dropdown',
    'planning-view-role-dropdown-trigger', 'planning-view-role-dropdown-menu',
    'planning-view-role-dropdown-option', 'planning-view-role-pill-list',
    'planning-view-role-pill', 'planning-view-role-pill-remove', 'ai-chat-panel',
    'ai-chat-header', 'ai-chat-title', 'ai-chat-close', 'ai-chat-body',
    'ai-chat-messages', 'ai-chat-message', 'ai-message-bubble', 'ai-message-content',
    'ai-view-button', 'user-message-bubble', 'ai-starter-prompts', 'ai-starter-prompt',
    'ai-typing-indicator', 'ai-chat-input-container', 'ai-chat-input', 'ai-send-button',
    'modal-footer', 'modal-done-button', 'source-dropdown', 'source-dropdown-item',
]
TOKEN_RES = [re.compile(r'\.' + re.escape(t) + r'(?![\w-])') for t in TOKENS]


def selector_matches(sel):
    return any(r.search(sel) for r in TOKEN_RES)


def parse_blocks(css):
    """Yield (prelude, body_text, is_at_rule) for top-level blocks."""
    i = 0
    n = len(css)
    blocks = []
    buf = ''
    while i < n:
        c = css[i]
        if c == '{':
            prelude = buf.strip()
            # find matching close brace
            depth = 1
            j = i + 1
            while j < n and depth > 0:
                if css[j] == '{':
                    depth += 1
                elif css[j] == '}':
                    depth -= 1
                j += 1
            body = css[i + 1:j - 1]
            blocks.append((prelude, body))
            buf = ''
            i = j
        elif c == '}':
            i += 1
        else:
            buf += c
            i += 1
    return blocks


def main():
    css = open(SRC).read()
    # strip comments
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    out = []
    for prelude, body in parse_blocks(css):
        if prelude.startswith('@'):
            if prelude.startswith('@media') or prelude.startswith('@supports'):
                inner = []
                for p2, b2 in parse_blocks(body):
                    if selector_matches(p2):
                        inner.append(f'{p2} {{{b2}}}')
                if inner:
                    out.append(f'{prelude} {{\n' + '\n'.join(inner) + '\n}')
            elif prelude.startswith('@keyframes'):
                # keep keyframes referenced by animation names we likely use
                if any(k in body for k in ['typing', 'spin', 'pulse', 'fade', 'slide']):
                    out.append(f'{prelude} {{{body}}}')
            else:
                continue
        else:
            if selector_matches(prelude):
                out.append(f'{prelude} {{{body}}}')
    header = '/* Extracted from deployed setup-app App.css — Review Available Measures modal. */\n'
    open(OUT, 'w').write(header + '\n'.join(out) + '\n')
    print('wrote', OUT, 'rules:', len(out))


if __name__ == '__main__':
    main()
