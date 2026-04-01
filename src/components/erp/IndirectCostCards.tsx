import React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface IndirectCostItem {
  id: string;
  name: string;
  subLabel: string;
  costPerUnit: number;
  monthlyTotal: number;
  iconType:
    | "packaging"
    | "storage"
    | "salaries"
    | "tools"
    | "rent"
    | "depreciation"
    | "electricity"
    | "compressed-air"
    | "custom";
  iconColor?: string;
}

type IconSvgProps = { className?: string; color?: string };

const PackagingIcon: React.FC<IconSvgProps> = ({ className, color = "rgb(var(--color-primary))" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="M4 8.5L12 4l8 4.5v7L12 20l-8-4.5v-7Z" stroke={color} strokeWidth="1.7" />
    <path d="M12 20v-7.2M4.8 8.9 12 13l7.2-4.1" stroke={color} strokeWidth="1.7" />
  </svg>
);

const StorageIcon: React.FC<IconSvgProps> = ({ className, color = "#0C447C" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <rect x="4" y="5" width="16" height="14" rx="2.2" stroke={color} strokeWidth="1.7" />
    <path d="M4 10h16M8 14h2.8M13.2 14H16" stroke={color} strokeWidth="1.7" />
  </svg>
);

const SalariesIcon: React.FC<IconSvgProps> = ({ className, color = "#4F46E5" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <circle cx="12" cy="8" r="3.3" stroke={color} strokeWidth="1.7" />
    <path d="M5.5 18.2c1.3-2.6 3.6-4 6.5-4s5.2 1.4 6.5 4" stroke={color} strokeWidth="1.7" />
  </svg>
);

const ToolsIcon: React.FC<IconSvgProps> = ({ className, color = "#633806" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="M14.5 5.3a3.3 3.3 0 1 0 4.2 4.2l-7.4 7.4a1.6 1.6 0 0 1-2.3 0l-1-1a1.6 1.6 0 0 1 0-2.3l7.5-7.3Z" stroke={color} strokeWidth="1.7" />
    <path d="m7.5 16.5 1.8 1.8" stroke={color} strokeWidth="1.7" />
  </svg>
);

const RentIcon: React.FC<IconSvgProps> = ({ className, color = "#444441" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="M4 10.2 12 4l8 6.2V19H4v-8.8Z" stroke={color} strokeWidth="1.7" />
    <path d="M9 19v-4.4h6V19" stroke={color} strokeWidth="1.7" />
  </svg>
);

const DepreciationIcon: React.FC<IconSvgProps> = ({ className, color = "#712B13" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="M12 5v14M7.5 8.5h7.7a2.5 2.5 0 0 1 0 5H9.8a2.5 2.5 0 0 0 0 5h6.7" stroke={color} strokeWidth="1.7" />
  </svg>
);

const ElectricityIcon: React.FC<IconSvgProps> = ({ className, color = "#633806" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="M13 3 6.8 12.1h4.4L10.7 21 17 11.9h-4.2L13 3Z" stroke={color} strokeWidth="1.7" />
  </svg>
);

const AirIcon: React.FC<IconSvgProps> = ({ className, color = "rgb(var(--color-primary))" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="M4 9.2h8.2a2.8 2.8 0 1 0-2.5-4M4 14.2h11.5a2.5 2.5 0 1 1-2.1 3.8M4 18.2h6.8" stroke={color} strokeWidth="1.7" />
  </svg>
);

const CustomIcon: React.FC<IconSvgProps> = ({ className, color = "#6B7280" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="7" stroke={color} strokeWidth="1.7" />
    <path d="M12 8v8M8 12h8" stroke={color} strokeWidth="1.7" />
  </svg>
);

const ICON_CONFIG: Record<IndirectCostItem["iconType"], { bg: string; svg: React.FC<IconSvgProps> }> = {
  packaging: { bg: "bg-[rgb(var(--color-primary)/0.12)]", svg: PackagingIcon },
  storage: { bg: "bg-[#E6F1FB]", svg: StorageIcon },
  salaries: { bg: "bg-[#EEEDFE]", svg: SalariesIcon },
  tools: { bg: "bg-[#FAEEDA]", svg: ToolsIcon },
  rent: { bg: "bg-[#F1EFE8]", svg: RentIcon },
  depreciation: { bg: "bg-[#FAECE7]", svg: DepreciationIcon },
  electricity: { bg: "bg-[#FAEEDA]", svg: ElectricityIcon },
  "compressed-air": { bg: "bg-[rgb(var(--color-primary)/0.12)]", svg: AirIcon },
  custom: { bg: "bg-gray-100", svg: CustomIcon },
};

function CostCard({ item }: { item: IndirectCostItem }) {
  const { t } = useTranslation();
  const config = ICON_CONFIG[item.iconType];
  const Icon = config.svg;
  const customColor = item.iconType === "custom" ? item.iconColor ?? "#6B7280" : undefined;

  return (
    <article
      className="rounded-[12px] bg-white p-[16px] text-right"
      style={{ border: "0.5px solid rgba(0,0,0,0.12)" }}
     
    >
      <div className="flex items-start gap-3">
        <div
          className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px]", config.bg)}
          style={{ border: "0.5px solid rgba(0,0,0,0.12)" }}
        >
          <Icon className="h-5 w-5" color={customColor} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-[#252521]">{item.name}</p>
          <p className="mt-1 text-[12px] font-normal text-[#6B6B64]">{item.subLabel}</p>
        </div>
      </div>

      <div className="my-3 h-px bg-[#E7E5DF]" />

      <div className="space-y-1">
        <p className="text-[14px] font-medium text-[#252521]">
          {item.costPerUnit.toLocaleString("ar-EG", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          {t("erpComponents.indirectCostCards.currencyPerUnit")}
        </p>
        <p className="text-[12px] font-normal text-[#6B6B64]">
          {item.monthlyTotal.toLocaleString("ar-EG", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          {t("erpComponents.indirectCostCards.currencyMonthly")}
        </p>
      </div>
    </article>
  );
}

interface IndirectCostCardsProps {
  items: IndirectCostItem[];
  className?: string;
}

export function IndirectCostCards({ items, className }: IndirectCostCardsProps) {
  const { t } = useTranslation();
  const totalPerUnit = items.reduce((sum, item) => sum + item.costPerUnit, 0);
  const totalMonthly = items.reduce((sum, item) => sum + item.monthlyTotal, 0);

  return (
    <section className={cn("space-y-3", className)}>
      <div
        className="rounded-[12px] bg-white px-[18px] py-[12px]"
        style={{ border: "0.5px solid rgba(0,0,0,0.12)" }}
      >
        <p className="text-[13px] font-medium text-[#444441]">
          {t("erpComponents.indirectCostCards.headerTitle", { count: items.length.toLocaleString("ar-EG") })}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => (
          <CostCard key={item.id} item={item} />
        ))}
      </div>

      <div
        className="rounded-[12px] bg-[rgb(var(--color-primary)/0.12)] px-[18px] py-[14px]"
        style={{ border: "0.5px solid rgba(0,0,0,0.12)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-[rgb(var(--color-primary))]">{t("erpComponents.indirectCostCards.totalTitle")}</p>
          <div className="text-left">
            <p className="text-[14px] font-medium text-[rgb(var(--color-primary))]">
              {totalPerUnit.toLocaleString("ar-EG", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              {t("erpComponents.indirectCostCards.currencyPerUnit")}
            </p>
            <p className="text-[12px] font-normal text-[rgb(var(--color-primary)/0.85)]">
              {totalMonthly.toLocaleString("ar-EG", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              {t("erpComponents.indirectCostCards.currencyMonthlyTotal")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
