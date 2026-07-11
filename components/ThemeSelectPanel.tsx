import React, { useCallback } from 'react';
import {
    AsidePanel,
    type AsidePanelLayout,
    type AsidePanelResizeProps,
} from './ui/aside-panel';
import { ScrollArea } from './ui/scroll-area';
import { ThemeList } from './ThemeList';

interface ThemeSelectPanelProps {
    open: boolean;
    selectedThemeId?: string;
    onSelect: (themeId: string) => void;
    onClose: () => void;
    onBack?: () => void;
    showBackButton?: boolean;
    layout?: AsidePanelLayout;
}

type ThemeSelectPanelPropsWithResize = ThemeSelectPanelProps & AsidePanelResizeProps;

const ThemeSelectPanel: React.FC<ThemeSelectPanelPropsWithResize> = ({
    open,
    selectedThemeId,
    onSelect,
    onClose,
    onBack,
    showBackButton = true,
    layout = 'overlay',
    resizable,
    persistWidthStorageKey,
    resizeAriaLabel,
}) => {
    // Select on pointerdown so macOS/Electron overlay scrollbars cannot swallow the click.
    const handleSelect = useCallback((themeId: string) => {
        onSelect(themeId);
    }, [onSelect]);

    return (
        <AsidePanel
            open={open}
            onClose={onClose}
            title="Select Color Theme"
            showBackButton={showBackButton}
            onBack={onBack}
            layout={layout}
            resizable={resizable}
            persistWidthStorageKey={persistWidthStorageKey}
            resizeAriaLabel={resizeAriaLabel}
        >
            {/* Single ScrollArea only — avoid nesting another scroller that ate clicks. */}
            <ScrollArea className="min-h-0 min-w-0 flex-1">
                <div className="py-2">
                    <ThemeList
                        selectedThemeId={selectedThemeId || ''}
                        onSelect={handleSelect}
                    />
                </div>
            </ScrollArea>
        </AsidePanel>
    );
};

export default ThemeSelectPanel;
