import { Icon } from "@/components/icons/Icon";
import { ArrowRight, Bookmark, FileText, Highlighter, ScrollText } from "lucide-react";

export function SourceIllustration() {
  return <div className="research-scene research-scene-source" aria-hidden="true">
    <div className="research-source-sheet"><Icon icon={FileText} size={18} /><span /><span /><span /></div>
    <div className="research-source-label">source.pdf</div>
    <div className="research-scene-line" />
    <div className="research-scene-dot" />
  </div>;
}

export function CitationIllustration() {
  return <div className="research-scene research-scene-citation" aria-hidden="true">
    <div className="research-answer-sheet"><span /><span className="research-answer-highlight" /><span /><span /><div className="research-citation-mark">1</div></div>
    <div className="research-citation-link"><span /><span /><span /></div>
    <div className="research-passage"><Icon icon={Highlighter} size={16} /><span /><span /><span /></div>
  </div>;
}

export function StudyIllustration() {
  return <div className="research-scene research-scene-study" aria-hidden="true">
    <div className="research-study-card"><div className="research-study-heading"><Icon icon={ScrollText} size={17} /><span /><span /></div><span /><span /><span /><div className="research-study-rule" /></div>
    <div className="research-study-bookmark"><Icon icon={Bookmark} size={15} /></div>
    <Icon icon={ArrowRight} size={16} className="research-scene-arrow" />
  </div>;
}
