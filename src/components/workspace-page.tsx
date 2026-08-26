import type { ReactNode } from "react";

export function WorkspacePage({eyebrow,title,description,action,children}:{eyebrow:string;title:string;description:string;action?:ReactNode;children:ReactNode}){return <div className="workspace-page"><header className="workspace-header"><div><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></div>{action}</header>{children}</div>}
export function StatusPill({value}:{value:string}){return <span className={`status-chip status-${value}`}>{value.replaceAll("_"," ")}</span>}
export function FilterBar({children}:{children:ReactNode}){return <form className="filter-bar" method="get">{children}</form>}
export function EmptyPanel({children}:{children:ReactNode}){return <div className="large-empty">{children}</div>}
