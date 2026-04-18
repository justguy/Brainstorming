import { DEFAULT_BOARD_ID, type BoardDocument } from '../board/types';
import type { BoardId } from '../types';
import { getDefaultBoard } from './boards';
import { listConnections } from './connections';
import { listCritiques } from './critiques';
import { listDocs } from './docs';
import { listGroups } from './groups';
import { listIdeas } from './ideas';
import { ensureBoardStorageBridge } from './migrationBridge';
import { listSuggestions } from './suggestions';
import { getBoardTweaks } from './tweaks';

export async function loadBoardDocument(boardId: BoardId = DEFAULT_BOARD_ID): Promise<BoardDocument> {
  const board = boardId === DEFAULT_BOARD_ID
    ? await ensureBoardStorageBridge()
    : await ensureBoardStorageBridge(boardId);

  const [ideas, groups, docs, suggestions, critiques, connections, tweaks] = await Promise.all([
    listIdeas(board.id),
    listGroups(board.id),
    listDocs(board.id),
    listSuggestions(board.id),
    listCritiques(board.id),
    listConnections(board.id),
    getBoardTweaks(board.id),
  ]);

  return {
    board,
    ideas,
    groups,
    docs,
    suggestions,
    critiques,
    connections,
    tweaks,
  };
}

export async function loadDefaultBoardDocument(): Promise<BoardDocument> {
  const board = await getDefaultBoard();
  return loadBoardDocument(board.id);
}
