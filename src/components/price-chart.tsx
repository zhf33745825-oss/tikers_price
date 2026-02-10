"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { EChartsOption } from "echarts";

import type { SymbolSeries } from "@/types/stock";

const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false,
});

interface PriceChartProps {
  series: SymbolSeries[];
}

interface TooltipRow {
  axisValueLabel?: string;
  axisValue?: string;
  marker: string;
  seriesName: string;
  data?: {
    value: number | null;
    adjClose: number | null;
  };
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return value.toFixed(2);
}

export function PriceChart({ series }: PriceChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const dates = Array.from(
      new Set(series.flatMap((item) => item.points.map((point) => point.date))),
    ).sort();

    const chartSeries = series.map((item) => {
      const pointMap = new Map(item.points.map((point) => [point.date, point]));
      return {
        name: item.symbol,
        type: "line" as const,
        smooth: true,
        showSymbol: false,
        emphasis: { focus: "series" as const },
        data: dates.map((date) => {
          const point = pointMap.get(date);
          return point
            ? {
                value: point.close,
                adjClose: point.adjClose,
              }
            : {
                value: null,
                adjClose: null,
              };
        }),
      };
    });

    return {
      color: [
        "#0f766e",
        "#2563eb",
        "#dc2626",
        "#d97706",
        "#7c3aed",
        "#0891b2",
        "#b45309",
        "#9333ea",
      ],
      tooltip: {
        trigger: "axis",
        borderColor: "#d6d3d1",
        borderWidth: 1,
        backgroundColor: "rgba(255,255,255,0.97)",
        textStyle: {
          color: "#1f2937",
        },
        formatter: (params: unknown) => {
          const rows = (Array.isArray(params) ? params : [params]) as TooltipRow[];
          if (rows.length === 0) {
            return "";
          }
          const date = rows[0].axisValueLabel ?? rows[0].axisValue ?? "";
          const body = rows
            .map((row) => {
              const raw = row.data as { value: number | null; adjClose: number | null };
              return `${row.marker}${row.seriesName} 收盘价: ${formatNumber(raw.value)} | 复权收盘价: ${formatNumber(raw.adjClose)}`;
            })
            .join("<br/>");

          return `${date}<br/>${body}`;
        },
      },
      legend: {
        top: 8,
      },
      grid: {
        left: 48,
        right: 20,
        top: 56,
        bottom: 56,
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: dates,
      },
      yAxis: {
        type: "value",
        scale: true,
      },
      dataZoom: [
        {
          type: "inside",
        },
        {
          type: "slider",
          start: 0,
          end: 100,
          height: 20,
          bottom: 16,
        },
      ],
      series: chartSeries as EChartsOption["series"],
    };
  }, [series]);

  return (
    <div className="panel">
      <h3 className="panel-title">历史收盘价走势</h3>
      <ReactECharts option={option} notMerge style={{ height: 420, width: "100%" }} />
    </div>
  );
}
