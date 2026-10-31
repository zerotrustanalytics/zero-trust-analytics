---
title: "Conversion rules"
description: "Stop counting successful visits as bounces, and track key actions as conversions."
weight: 6
---

Sometimes a "bounce" is a success. Someone lands on `/start-now`, clicks **Sign up**, and is sent to another app: they left quickly, but they did exactly what you wanted. Conversion rules fix that.

## Create a rule

1. Open the site, then **Conversion Rules** in its sidebar.
2. Choose **Add Rule**.
3. Give it a **Rule Name**.
4. Say what to match. Use any combination of:
   - **Page Path**: an exact path, or a pattern such as `/signup.*`.
   - **Event Type**: a [custom event](/docs/custom-events/) name.
   - **Event Data**: a property of that event and the value it must have.
5. Choose the **Action**:
   - **Exclude from Bounce**: a visit matching the rule never counts as a bounce.
   - **Conversion Goal**: the matching action is tracked as a conversion.
6. Leave **Enabled** on, and choose **Create Rule**.

Turn a rule off with **Enabled** at any time without deleting it.
