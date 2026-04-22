import type { ComponentType } from 'react';

import type { BoardThemeMode, Idea } from '../../types';
import type { IdeaTone } from '../canvasFocus';

export const IDEA_FLOW_NODE_TYPE = 'idea-note' as const;

export interface IdeaFlowNodeCallbacks extends Record<string, unknown> {
  onOpenIdea?: (ideaId: string) => void;
  onOpenDocs?: (ideaId: string) => void;
  onDiscardIdea?: (ideaId: string) => void;
  onStartLink?: (ideaId: string) => void;
  onCompleteLink?: (ideaId: string) => void;
}

export interface IdeaFlowNodeData extends IdeaFlowNodeCallbacks, Record<string, unknown> {
  idea: Idea;
  boardTheme: BoardThemeMode;
  selected?: boolean;
  tone?: IdeaTone;
  docCount?: number;
  groupColor?: string;
  highlight?: boolean;
  mergeProgress?: number;
  beingMergedInto?: boolean;
  linkModeEnabled?: boolean;
  linkModeAnchor?: boolean;
  linkModePending?: boolean;
}

export interface IdeaFlowNodeProps {
  id: string;
  data: IdeaFlowNodeData;
  selected?: boolean;
  dragging?: boolean;
  zIndex?: number;
  isConnectable?: boolean;
}

export type IdeaFlowNodeMap = Record<typeof IDEA_FLOW_NODE_TYPE, ComponentType<IdeaFlowNodeProps>>;
