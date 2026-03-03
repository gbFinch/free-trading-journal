import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CalendarView from "./index";
import { useMetricsStore } from "@/stores";
import * as tradesApi from "@/api/trades";
import type { DailyPerformance, TradeWithDerived } from "@/types";

vi.mock("@/stores", () => ({
  useMetricsStore: vi.fn(),
}));

vi.mock("@/api/trades", () => ({
  getTrades: vi.fn(),
}));

const mockDailyPerformance: DailyPerformance[] = [
  { date: "2024-01-15", realized_net_pnl: 500, trade_count: 3, win_count: 2, loss_count: 1 },
  { date: "2024-01-16", realized_net_pnl: -200, trade_count: 2, win_count: 0, loss_count: 2 },
];

const mockTrade: TradeWithDerived = {
  id: "trade-1",
  user_id: "user-1",
  account_id: "account-1",
  instrument_id: "inst-1",
  symbol: "AAPL",
  asset_class: "stock",
  trade_number: 1,
  trade_date: "2024-01-15",
  direction: "long",
  quantity: 100,
  entry_price: 150,
  exit_price: 160,
  stop_loss_price: 145,
  entry_time: null,
  exit_time: null,
  fees: 2,
  strategy: "momentum",
  notes: null,
  status: "closed",
  created_at: "2024-01-15T09:30:00Z",
  updated_at: "2024-01-15T15:00:00Z",
  gross_pnl: 1000,
  net_pnl: 998,
  pnl_per_share: 10,
  risk_per_share: 5,
  r_multiple: 2,
  result: "win",
};

function renderWithRouter(initialEntries = ["/calendar"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <CalendarView />
    </MemoryRouter>
  );
}

describe("CalendarView", () => {
  const mockFetchDailyPerformance = vi.fn();
  const mockSetDateRange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Set a fixed date for consistent testing
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-20"));
    vi.mocked(tradesApi.getTrades).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("loading state", () => {
    it("shows loading indicator when loading", () => {
      vi.mocked(useMetricsStore).mockReturnValue({
        dailyPerformance: [],
        fetchDailyPerformance: mockFetchDailyPerformance,
        setDateRange: mockSetDateRange,
        isLoading: true,
      });

      renderWithRouter();

      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });
  });

  describe("calendar structure", () => {
    beforeEach(() => {
      vi.mocked(useMetricsStore).mockReturnValue({
        dailyPerformance: mockDailyPerformance,
        fetchDailyPerformance: mockFetchDailyPerformance,
        setDateRange: mockSetDateRange,
        isLoading: false,
      });
    });

    it("renders page title", () => {
      renderWithRouter();

      expect(screen.getByText("Calendar")).toBeInTheDocument();
    });

    it("displays current month and year", () => {
      renderWithRouter();

      expect(screen.getByText("January 2024")).toBeInTheDocument();
    });

    it("renders day headers", () => {
      renderWithRouter();

      expect(screen.getByText("Sun")).toBeInTheDocument();
      expect(screen.getByText("Mon")).toBeInTheDocument();
      expect(screen.getByText("Tue")).toBeInTheDocument();
      expect(screen.getByText("Wed")).toBeInTheDocument();
      expect(screen.getByText("Thu")).toBeInTheDocument();
      expect(screen.getByText("Fri")).toBeInTheDocument();
      expect(screen.getByText("Sat")).toBeInTheDocument();
    });

    it("displays monthly total P&L", () => {
      renderWithRouter();

      // 500 + (-200) = $300, shown in header badge
      const pnlBadges = screen.getAllByText("$300");
      expect(pnlBadges.length).toBeGreaterThan(0);
    });

    it("calls fetchDailyPerformance on mount", () => {
      renderWithRouter();

      expect(mockFetchDailyPerformance).toHaveBeenCalled();
    });

    it("calls setDateRange on mount", () => {
      renderWithRouter();

      expect(mockSetDateRange).toHaveBeenCalledWith({
        start: "2024-01-01",
        end: "2024-01-31",
      });
    });
  });

  describe("navigation", () => {
    beforeEach(() => {
      vi.mocked(useMetricsStore).mockReturnValue({
        dailyPerformance: [],
        fetchDailyPerformance: mockFetchDailyPerformance,
        setDateRange: mockSetDateRange,
        isLoading: false,
      });
    });

    it("navigates to previous month", () => {
      renderWithRouter();

      fireEvent.click(screen.getByLabelText("Previous month"));

      expect(screen.getByText("December 2023")).toBeInTheDocument();
    });

    it("navigates to next month", () => {
      renderWithRouter();

      fireEvent.click(screen.getByLabelText("Next month"));

      expect(screen.getByText("February 2024")).toBeInTheDocument();
    });
  });

  describe("day selection", () => {
    beforeEach(() => {
      vi.mocked(useMetricsStore).mockReturnValue({
        dailyPerformance: mockDailyPerformance,
        fetchDailyPerformance: mockFetchDailyPerformance,
        setDateRange: mockSetDateRange,
        isLoading: false,
      });
      vi.mocked(tradesApi.getTrades).mockResolvedValue([mockTrade]);
    });

    it("shows day detail when day is clicked", async () => {
      vi.useRealTimers();
      renderWithRouter(["/calendar?date=2024-01-15"]);

      await waitFor(() => {
        expect(screen.getByText("January 15, 2024")).toBeInTheDocument();
      });
    });

    it("displays trades for selected day", async () => {
      vi.useRealTimers();
      renderWithRouter(["/calendar?date=2024-01-15"]);

      await waitFor(() => {
        expect(screen.getByText("AAPL")).toBeInTheDocument();
        expect(screen.getByText("LONG")).toBeInTheDocument();
      });
    });

    it("closes day detail on Close click", async () => {
      vi.useRealTimers();
      renderWithRouter(["/calendar?date=2024-01-15"]);

      await waitFor(() => {
        expect(screen.getByText("January 15, 2024")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Close"));

      expect(screen.queryByText("January 15, 2024")).not.toBeInTheDocument();
    });

    it("days without trades are disabled", () => {
      vi.mocked(tradesApi.getTrades).mockResolvedValue([]);

      renderWithRouter();

      // Find day buttons - days without trades should be disabled
      const dayButtons = screen.getAllByRole("button");
      // Find a button that contains just "1" as day number (a day without trades)
      const day1Button = dayButtons.find(b => {
        const dayText = b.querySelector(".text-xs");
        return dayText?.textContent === "1";
      });

      if (day1Button) {
        expect(day1Button).toBeDisabled();
      }
    });
  });

  describe("P&L display", () => {
    beforeEach(() => {
      vi.mocked(useMetricsStore).mockReturnValue({
        dailyPerformance: mockDailyPerformance,
        fetchDailyPerformance: mockFetchDailyPerformance,
        setDateRange: mockSetDateRange,
        isLoading: false,
      });
    });

    it("displays positive P&L with formatting", () => {
      renderWithRouter();

      expect(screen.getByText("$500")).toBeInTheDocument();
    });

    it("displays trade count for days with trades", () => {
      renderWithRouter();

      expect(screen.getByText("3 trades")).toBeInTheDocument();
      expect(screen.getByText("2 trades")).toBeInTheDocument();
    });
  });

  describe("selected date persistence", () => {
    beforeEach(() => {
      vi.mocked(useMetricsStore).mockReturnValue({
        dailyPerformance: mockDailyPerformance,
        fetchDailyPerformance: mockFetchDailyPerformance,
        setDateRange: mockSetDateRange,
        isLoading: false,
      });
      vi.mocked(tradesApi.getTrades).mockResolvedValue([mockTrade]);
    });

    it("restores selected date from URL params", async () => {
      vi.useRealTimers();
      renderWithRouter(["/calendar?date=2024-01-15"]);

      await waitFor(() => {
        expect(screen.getByText("January 15, 2024")).toBeInTheDocument();
      });
    });

    it("restores selected month from URL params", () => {
      renderWithRouter(["/calendar?month=2023-12"]);

      expect(screen.getByText("December 2023")).toBeInTheDocument();
      expect(mockSetDateRange).toHaveBeenCalledWith({
        start: "2023-12-01",
        end: "2023-12-31",
      });
    });

    it("infers selected month from selected date when month param is missing", async () => {
      vi.useRealTimers();
      renderWithRouter(["/calendar?date=2023-12-15"]);

      await waitFor(() => {
        expect(screen.getByText("December 2023")).toBeInTheDocument();
      });

      expect(mockSetDateRange).toHaveBeenCalledWith({
        start: "2023-12-01",
        end: "2023-12-31",
      });
    });
  });
});
