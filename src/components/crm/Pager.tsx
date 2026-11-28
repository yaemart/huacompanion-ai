export function Pager({
  label,
  data,
  disabled,
  onPage,
}: {
  label: string;
  data: { page: number; limit: number; total: number };
  disabled: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <nav aria-label={`${label}分页`} className="crm-actions">
      <button
        type="button"
        disabled={disabled || data.page <= 1}
        onClick={() => onPage(data.page - 1)}
      >
        上一页
      </button>
      <span>
        第 {data.page} 页 · {data.total} 项
      </span>
      <button
        type="button"
        disabled={disabled || data.page * data.limit >= data.total}
        onClick={() => onPage(data.page + 1)}
      >
        下一页
      </button>
    </nav>
  );
}
