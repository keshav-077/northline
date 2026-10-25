# Northline recording outline

Maximum 10 minutes. Record the running desk, not slides. Load decision 14 January and cutoff 09:20 before the first sentence. Say only what this build does.

The January totals on the default rule, from the checked snapshot, are MAE 2,038.91 MW, RMSE 2,504.76 MW, and bias +1,747.89 MW across 744 hours. The 14 January delivery-15 example is MAE and bias 1,041.83 MW, RMSE 1,149.26 MW. Hour 00:00 is forecast 15,834 MW, half hours 14,602 and 14,311.

## Part 1 — client, 5 minutes

- 0:00–0:40. The desk has to buy tomorrow’s power this morning. Wind will not match the forecast, and the purchase cannot wait for the outturn.
- 0:40–1:20. Show decision 14 January, delivery 15 January, cutoff 09:20, vintage 07:30 GMT. Point at the line that the next file, 09:30, is excluded.
- 1:20–2:20. Walk the chart. The green step is the hourly forecast. The darker line is the half-hour outturn. Open one tooltip.
- 2:20–3:20. Read the day MAE, RMSE, and bias, then the January figures. Positive means the forecast was high, so wind was overstated at purchase time. Say this is not a quantity to buy.
- 3:20–4:10. Switch the cutoff to 09:50 and show the vintage move to 09:30. Switch back. Mention 15:30 as the later half-hour auction, not the default.
- 4:10–5:00. National metered wind only, hourly forecast against two half hours, historical January, Elexon is the source. Close on the value: the buyer can see the forecast they actually had, and how far the outturn later was.

## Part 2 — technical review, 5 minutes

- 0:00–0:40. One FastAPI process, a checksummed snapshot, and the React desk. A page request does not call Elexon.
- 0:40–1:30. Show `backend/app/elexon/client.py`, `ingest.py`, and `data/snapshot/manifest.json`. Day-sized requests, retries, and the BMRS attribution.
- 1:30–2:30. Show `domain/selection.py` and the test that rejects a publication after the cutoff. Mention that January files are stamped an hour earlier than the webpage clock, and that 15 January has a 12:25 file instead of 11:30.
- 2:30–3:20. Show the hourly mean in `domain/evaluate.py` and `domain/metrics.py`, then the recorded 15 January fixture test.
- 3:20–4:10. The evaluation response, the URL (`date`, `cutoff`, `strategy`), and a missing hour staying out of the metrics.
- 4:10–5:00. Docker, the host, `python -m pytest`, and the trade-off: a committed snapshot so the review does not depend on Elexon being up.

## Upload

Unlisted YouTube video, at most 10 minutes. Open the video URL and the application URL in a private window before submitting the form.
