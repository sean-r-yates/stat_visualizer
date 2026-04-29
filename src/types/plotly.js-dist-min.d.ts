declare module "plotly.js-dist-min" {
  export type PlotlyData = Record<string, unknown>;
  export type PlotlyLayout = Record<string, unknown>;
  export type PlotlyConfig = Record<string, unknown>;

  const Plotly: {
    react(
      root: HTMLElement,
      data: PlotlyData[],
      layout: PlotlyLayout,
      config?: PlotlyConfig,
    ): Promise<unknown>;
    purge(root: HTMLElement): void;
  };

  export default Plotly;
}
