**Paddy Advisory Lab**

Prototype · synthetic farms

Reliability of the resource-aware method

## Weather advisory decisions for smallholder rice farms

0/ 100

\-

## Run the experiment

Each run draws new synthetic farms and weather events from the seed, then scores all three methods on the same cases.

Farms

Random seed

Weight: expected benefit

Weight: resource load

Weight: weather risk

## Method comparison

Same farms, same weather. Cost is realised crop loss plus action cost, in rupees per farm.

## What the framework decided

A verdict is CANNOT ACT when the action with the best expected benefit is infeasible for that farm.

## Forecast calibration

Forecast probability against how often rain occurred. These forecasts are synthetic.

## Try one farm

Change the farm and the forecast. The table shows every action, ranked by the resource-aware method.

Net benefit is the rain loss avoided minus the action cost, in expectation. Resource load is the share of the farm's own labour and cash the action uses. Risk is the loss if the rain arrives after the action.

## Proof of work: unit tests

Run in your browser when the page loads. The first three reproduce the worked examples from the concept note.

## Assumptions and export

Every value below is an editable assumption in engine.js. None is a measured farm value.

```

```