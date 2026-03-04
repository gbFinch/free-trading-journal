import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TradeDetail from "./index";
import { useTradesStore } from "@/stores";
import { getTradeExecutions } from "@/api/import";
import type { Execution, TradeWithDerived } from "@/types";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "trade-1" }),
  useNavigate: () => mockNavigate,
}));

vi.mock("@/stores", () => ({
  useTradesStore: vi.fn(),
}));

vi.mock("@/components/TradeForm", () => ({
  default: ({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) => (
    <div data-testid="trade-form">
      <button onClick={onSuccess}>Save</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

vi.mock("@/api/import", () => ({
  getTradeExecutions: vi.fn().mockResolvedValue([]),
}));

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
  notes: "Good setup",
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

describe("TradeDetail", () => {
  const mockSelectTrade = vi.fn();
  const mockDeleteTrade = vi.fn();
  const mockFetchTrades = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTradeExecutions).mockResolvedValue([]);
  });

  describe("loading state", () => {
    it("shows loading indicator when loading", () => {
      vi.mocked(useTradesStore).mockReturnValue({
        selectedTrade: null,
        selectTrade: mockSelectTrade,
        deleteTrade: mockDeleteTrade,
        fetchTrades: mockFetchTrades,
        isLoading: true,
      });

      render(<TradeDetail />);

      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });
  });

  describe("not found state", () => {
    it("shows not found message when trade is null", () => {
      vi.mocked(useTradesStore).mockReturnValue({
        selectedTrade: null,
        selectTrade: mockSelectTrade,
        deleteTrade: mockDeleteTrade,
        fetchTrades: mockFetchTrades,
        isLoading: false,
      });

      render(<TradeDetail />);

      expect(screen.getByText("Trade not found.")).toBeInTheDocument();
    });

    it("shows back to trades link", () => {
      vi.mocked(useTradesStore).mockReturnValue({
        selectedTrade: null,
        selectTrade: mockSelectTrade,
        deleteTrade: mockDeleteTrade,
        fetchTrades: mockFetchTrades,
        isLoading: false,
      });

      render(<TradeDetail />);

      expect(screen.getByText("Back to trades")).toBeInTheDocument();
    });

    it("navigates to trades on back link click", async () => {
      const user = userEvent.setup();
      vi.mocked(useTradesStore).mockReturnValue({
        selectedTrade: null,
        selectTrade: mockSelectTrade,
        deleteTrade: mockDeleteTrade,
        fetchTrades: mockFetchTrades,
        isLoading: false,
      });

      render(<TradeDetail />);

      await user.click(screen.getByText("Back to trades"));

      expect(mockNavigate).toHaveBeenCalledWith("/trades");
    });
  });

  describe("with trade data", () => {
    beforeEach(() => {
      vi.mocked(useTradesStore).mockReturnValue({
        selectedTrade: mockTrade,
        selectTrade: mockSelectTrade,
        deleteTrade: mockDeleteTrade,
        fetchTrades: mockFetchTrades,
        isLoading: false,
      });
    });

    it("calls selectTrade on mount with id", () => {
      render(<TradeDetail />);

      expect(mockSelectTrade).toHaveBeenCalledWith("trade-1");
    });

    it("displays trade symbol", () => {
      render(<TradeDetail />);

      expect(screen.getByText("AAPL")).toBeInTheDocument();
    });

    it("displays trade direction badge", () => {
      render(<TradeDetail />);

      expect(screen.getByText("LONG")).toBeInTheDocument();
    });

    it("displays Edit and Delete buttons", () => {
      render(<TradeDetail />);

      expect(screen.getByText("Edit")).toBeInTheDocument();
      expect(screen.getByText("Delete")).toBeInTheDocument();
    });

    it("displays trade details section", () => {
      render(<TradeDetail />);

      expect(screen.getByText("Trade Details")).toBeInTheDocument();
      expect(screen.getByText("Entry Price")).toBeInTheDocument();
      expect(screen.getByText("$150.00")).toBeInTheDocument();
      expect(screen.getByText("Exit Price")).toBeInTheDocument();
      expect(screen.getByText("$160.00")).toBeInTheDocument();
      expect(screen.getByText("Quantity")).toBeInTheDocument();
      expect(screen.getByText("100")).toBeInTheDocument();
    });

    it("displays performance section", () => {
      render(<TradeDetail />);

      expect(screen.getByText("Performance")).toBeInTheDocument();
      expect(screen.getByText("Result")).toBeInTheDocument();
      expect(screen.getByText("WIN")).toBeInTheDocument();
      expect(screen.getByText("Gross P&L")).toBeInTheDocument();
      expect(screen.getByText("$1,000.00")).toBeInTheDocument();
      expect(screen.getByText("Net P&L")).toBeInTheDocument();
      expect(screen.getByText("$998.00")).toBeInTheDocument();
    });

    it("displays fallback entry execution when no execution rows exist", async () => {
      render(<TradeDetail />);

      expect(screen.getByText("Executions")).toBeInTheDocument();
      expect(await screen.findByText("Entries (1)")).toBeInTheDocument();
      expect(screen.getByText("Qty")).toBeInTheDocument();
      expect(screen.getByText("Price")).toBeInTheDocument();
    });

    it("displays per-scale PnL contribution for exits", async () => {
      const executions: Execution[] = [
        {
          execution_type: "entry",
          execution_date: "2024-01-15",
          execution_time: "09:30:00",
          quantity: 100,
          price: 150,
          fees: 2,
          exchange: null,
          broker_execution_id: "entry-1",
        },
        {
          execution_type: "exit",
          execution_date: "2024-01-15",
          execution_time: "10:00:00",
          quantity: 60,
          price: 155,
          fees: 0.6,
          exchange: null,
          broker_execution_id: "exit-1",
        },
        {
          execution_type: "exit",
          execution_date: "2024-01-15",
          execution_time: "10:30:00",
          quantity: 40,
          price: 160,
          fees: 0.4,
          exchange: null,
          broker_execution_id: "exit-2",
        },
      ];
      vi.mocked(getTradeExecutions).mockResolvedValueOnce(executions);

      render(<TradeDetail />);

      expect(await screen.findByText("Scale P&L")).toBeInTheDocument();
      expect(screen.getByText("$298.20")).toBeInTheDocument();
      expect(screen.getByText("$398.80")).toBeInTheDocument();
    });

    it("displays R-Multiple", () => {
      render(<TradeDetail />);

      expect(screen.getByText("R-Multiple")).toBeInTheDocument();
      expect(screen.getByText("2.00")).toBeInTheDocument();
    });

    it("displays notes section", () => {
      render(<TradeDetail />);

      expect(screen.getByText("Notes")).toBeInTheDocument();
      expect(screen.getByText("Good setup")).toBeInTheDocument();
    });

    it("navigates back on Back button click", async () => {
      const user = userEvent.setup();
      render(<TradeDetail />);

      await user.click(screen.getByText("← Back"));

      expect(mockNavigate).toHaveBeenCalledWith(-1);
    });
  });

  describe("edit functionality", () => {
    beforeEach(() => {
      vi.mocked(useTradesStore).mockReturnValue({
        selectedTrade: mockTrade,
        selectTrade: mockSelectTrade,
        deleteTrade: mockDeleteTrade,
        fetchTrades: mockFetchTrades,
        isLoading: false,
      });
    });

    it("opens edit modal on Edit click", async () => {
      const user = userEvent.setup();
      render(<TradeDetail />);

      await user.click(screen.getByText("Edit"));

      expect(screen.getByText("Edit Trade")).toBeInTheDocument();
      expect(screen.getByTestId("trade-form")).toBeInTheDocument();
    });

    it("closes edit modal on Cancel", async () => {
      const user = userEvent.setup();
      render(<TradeDetail />);

      await user.click(screen.getByText("Edit"));
      await user.click(screen.getByText("Cancel"));

      expect(screen.queryByTestId("trade-form")).not.toBeInTheDocument();
    });

    it("refreshes trade on save success", async () => {
      const user = userEvent.setup();
      render(<TradeDetail />);

      await user.click(screen.getByText("Edit"));
      await user.click(screen.getByText("Save"));

      expect(mockSelectTrade).toHaveBeenCalledWith("trade-1");
      expect(mockFetchTrades).toHaveBeenCalled();
    });
  });

  describe("delete functionality", () => {
    beforeEach(() => {
      vi.mocked(useTradesStore).mockReturnValue({
        selectedTrade: mockTrade,
        selectTrade: mockSelectTrade,
        deleteTrade: mockDeleteTrade.mockResolvedValue(undefined),
        fetchTrades: mockFetchTrades,
        isLoading: false,
      });
    });

    it("opens delete confirmation on Delete click", async () => {
      const user = userEvent.setup();
      render(<TradeDetail />);

      await user.click(screen.getByText("Delete"));

      expect(screen.getByText("Delete Trade?")).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to delete this trade/)).toBeInTheDocument();
    });

    it("closes confirmation on Cancel", async () => {
      const user = userEvent.setup();
      render(<TradeDetail />);

      await user.click(screen.getByText("Delete"));
      // Find the Cancel in the modal (there's also Cancel in mock form)
      const cancelButtons = screen.getAllByText("Cancel");
      await user.click(cancelButtons[cancelButtons.length - 1]);

      expect(screen.queryByText("Delete Trade?")).not.toBeInTheDocument();
    });

    it("deletes trade and navigates on confirm", async () => {
      const user = userEvent.setup();
      render(<TradeDetail />);

      await user.click(screen.getByText("Delete"));
      // Find the Delete button in the modal
      const deleteButtons = screen.getAllByText("Delete");
      await user.click(deleteButtons[deleteButtons.length - 1]);

      expect(mockDeleteTrade).toHaveBeenCalledWith("trade-1");
      expect(mockNavigate).toHaveBeenCalledWith("/trades");
    });
  });
});
