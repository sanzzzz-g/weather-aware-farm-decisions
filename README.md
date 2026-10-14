# 🌾 Weather-Aware Farm Decisions

### Resource-Aware Decision Support for Smallholder Rice Farmers

A research prototype that explores how weather forecasts can be translated into practical agricultural decisions by considering not only weather risk, but also farmers' financial resources, labour, machinery, and time constraints.

## 📌 Problem Statement

Weather-based agricultural advisory systems recommend actions based on expected weather conditions. However, smallholder rice farmers may not have sufficient money, labour, machinery, or time to carry out these recommendations before a weather event occurs.

For example, if heavy rainfall is expected within the next 24 hours, a farmer may be advised to harvest mature rice. Whether this recommendation is practical depends on the availability and affordability of workers or harvesting machinery and the time required to complete the task.

This project explores a resource-aware decision-support framework that evaluates the feasibility and expected economic benefit of agricultural actions under weather uncertainty.

## 🎯 Objectives

- Evaluate agricultural actions using weather risk and expected economic benefit.
- Represent farm-specific resource constraints, including labour and available cash.
- Distinguish between actions that are feasible, actions that should be delayed, and actions that cannot currently be performed.
- Explore alternative actions when the preferred recommendation is infeasible.
- Compare the resource-aware method with simpler decision-making approaches.
- Study how forecast uncertainty affects agricultural decisions.

## 💡 Key Features

- **Weather-aware decisions:** Evaluate actions based on the probability and potential impact of adverse weather.
- **Resource feasibility:** Consider labour, cash, and resource requirements.
- **Economic assessment:** Estimate expected benefits, action costs, and potential crop losses.
- **Decision classification:** Produce ACT, WAIT, or CANNOT ACT outcomes.
- **Method comparison:** Evaluate different decision strategies using the same synthetic farm and weather scenarios.
- **Forecast calibration:** Visualise synthetic forecast probabilities against observed event frequencies.
- **Interactive experiment:** Adjust the number of farms, random seed, and decision-model weights.
- **Unit tests:** Run browser-based tests for selected worked examples.
- **Assumption transparency:** Keep model assumptions explicit and editable.

## 🧠 Decision Framework

The prototype considers three possible outcomes:

| Decision | Meaning |
|---|---|
| ACT | The action is feasible and justified by the decision model. |
| WAIT | Delaying or reassessing is preferable under the model's assumptions. |
| CANNOT ACT | The preferred action is infeasible because of resource or timing constraints. |

When an action is infeasible, a practical system should assess whether a valid alternative is available rather than automatically assuming that no action is possible.

## 🔬 Research Approach

The prototype compares three decision-making methods using the same generated farm scenarios and weather events.

The evaluation explores:

- Expected economic benefit.
- Resource requirements and feasibility.
- Weather-related risk.
- Realised crop loss and action cost.
- Differences between decision methods.
- Behaviour under synthetic forecast probabilities.

The objective is to investigate whether explicitly modelling farm-resource constraints can improve the practicality of weather-based recommendations.

## 🛠️ Technology Stack

- HTML
- CSS
- JavaScript
- Browser-based interactive visualisation
- JavaScript unit tests

## 🚀 How to Run

1. Clone or download this repository.
2. Open `index.html` in a modern web browser.
3. Run the experiment using the provided controls.
4. Adjust the model parameters and inspect the comparison results.
5. Review the assumptions and unit-test results.

If your local setup uses JavaScript modules or browser security restrictions prevent the application from loading, serve the project through a local HTTP server instead.

For example, using Python:

```bash
python3 -m http.server 8000
```

Then open:

`http://localhost:8000`

## 📂 Project Structure

```text
weather-aware-farm-decisions/
├── index.html
├── engine.js
├── Paddy Advisory Lab.md
└── README.md
```

## ⚠️ Data and Limitations

**This is a research prototype, not a validated agricultural advisory service.**

The current Paddy Advisory Lab experiment uses synthetic farms, weather events, and forecast probabilities. Its numerical outputs demonstrate the behaviour of the decision framework; they are not measured agricultural outcomes or evidence of real-world improvements.

The model's assumptions must be validated using reliable data on weather forecasts, crop conditions, labour availability, machinery access, action costs, and crop losses before practical deployment.

The prototype should not replace official weather warnings or advice from qualified agricultural experts.

## 🔭 Future Work

- Integrate reliable historical weather and forecast datasets.
- Obtain or collect farm-resource and agricultural cost data.
- Validate decision rules with agricultural experts.
- Evaluate the framework on realistic rice-farming scenarios.
- Compare the proposed method against generic advisories and cost-loss baselines.
- Assess whether feasible alternative actions can reduce expected losses.
- Conduct field validation before making claims about benefits to farmers.

## 📚 Research Motivation

The project is motivated by research on agricultural advisory adoption, the effects of weather forecasts on farmers' decisions, and the economic value of probabilistic forecasts.

The proposed research direction is to investigate the integration of forecast uncertainty, farm-specific resource constraints, and economic feasibility within a single decision-support workflow.

The novelty of this combination must be established through a systematic review of existing literature.

## 👩‍💻 Project Status

**Status:** Research prototype / experimental evaluation.

The current implementation is intended to support experimentation with decision rules and to identify the data and validation required for further research.
