import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, parseISO, isValid, isSameMonth } from 'date-fns';
import { useMetricsStore } from '@/stores';
import { getTrades } from '@/api/trades';
import type { TradeWithDerived } from '@/types';
import clsx from 'clsx';
import MonthlyCalendar from '@/components/MonthlyCalendar';

export default function CalendarView() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedDate = searchParams.get('date');
  const monthParam = searchParams.get('month');

  const [currentDate, setCurrentDate] = useState(() => {
    if (monthParam) {
      const parsedMonth = parseISO(`${monthParam}-01`);
      if (isValid(parsedMonth)) {
        return startOfMonth(parsedMonth);
      }
    }

    if (selectedDate) {
      const parsedDate = parseISO(selectedDate);
      if (isValid(parsedDate)) {
        return startOfMonth(parsedDate);
      }
    }

    return startOfMonth(new Date());
  });
  const [dayTrades, setDayTrades] = useState<TradeWithDerived[]>([]);
  const { dailyPerformance, fetchDailyPerformance, setDateRange, isLoading } = useMetricsStore();

  useEffect(() => {
    if (!monthParam) return;
    const parsedMonth = parseISO(`${monthParam}-01`);
    if (!isValid(parsedMonth)) return;
    const normalized = startOfMonth(parsedMonth);

    if (!isSameMonth(currentDate, normalized)) {
      setCurrentDate(normalized);
    }
  }, [monthParam, currentDate]);

  useEffect(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    setDateRange({
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
    });
    fetchDailyPerformance();
  }, [currentDate, fetchDailyPerformance, setDateRange]);

  useEffect(() => {
    if (selectedDate) {
      getTrades({ startDate: selectedDate, endDate: selectedDate })
        .then(setDayTrades)
        .catch(() => setDayTrades([]));
    } else {
      setDayTrades([]);
    }
  }, [selectedDate]);

  const handleMonthChange = (date: Date) => {
    const normalized = startOfMonth(date);
    setCurrentDate(normalized);
    setSearchParams({ month: format(normalized, 'yyyy-MM') });
  };

  const handleDayClick = (date: string) => {
    setSearchParams({
      month: format(startOfMonth(currentDate), 'yyyy-MM'),
      date,
    });
  };

  const handleCloseDetail = () => {
    setSearchParams({
      month: format(startOfMonth(currentDate), 'yyyy-MM'),
    });
  };

  return (
    <div className="p-6 pt-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Calendar</h1>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-stone-400">Loading...</div>
      ) : (
        <>
          <MonthlyCalendar
            data={dailyPerformance}
            month={currentDate}
            selectedDate={selectedDate}
            onMonthChange={handleMonthChange}
            onDayClick={handleDayClick}
          />

          {/* Day Detail Sidebar */}
          {selectedDate && (
            <div className="app-panel mt-6 p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                  {format(parseISO(selectedDate), 'MMMM d, yyyy')}
                </h2>
                <button
                  onClick={handleCloseDetail}
                  className="text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
                >
                  Close
                </button>
              </div>

              {dayTrades.length === 0 ? (
                <p className="text-stone-500 dark:text-stone-400">No trades on this day.</p>
              ) : (
                <div className="space-y-2">
                  {dayTrades.map(trade => (
                    <button
                      key={trade.id}
                      onClick={() => navigate(`/trades/${trade.id}`)}
                      className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-stone-200 bg-stone-50 p-2 text-left transition-colors hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800/70 dark:hover:bg-stone-700"
                    >
                      <div>
                        <span className="font-medium text-stone-900 dark:text-stone-100">{trade.symbol}</span>
                        <span className="ml-2 text-sm text-stone-500 dark:text-stone-400">
                          {trade.direction.toUpperCase()}
                        </span>
                      </div>
                      <div
                        className={clsx(
                          'font-bold',
                          (trade.net_pnl ?? 0) > 0
                            ? 'text-green-400'
                            : (trade.net_pnl ?? 0) < 0
                            ? 'text-red-400'
                            : 'text-stone-400'
                        )}
                      >
                        ${trade.net_pnl?.toFixed(2) ?? '0.00'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
