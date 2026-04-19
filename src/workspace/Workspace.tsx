import { WorkspaceActiveFlow, type WorkspaceActiveFlowProps } from './WorkspaceActiveFlow';
import {
  WorkspaceInspector,
  type WorkspaceInspectorProps,
} from './WorkspaceInspector';

export type WorkspacePhaseFlowProps = WorkspaceActiveFlowProps;

export { WorkspaceActiveFlow, WorkspaceInspector };

export function WorkspacePhaseFlow(props: WorkspacePhaseFlowProps) {
  return <WorkspaceActiveFlow {...props} />;
}

export type { WorkspaceInspectorProps };

export default WorkspaceInspector;
