export function demoVehicle(registration) {
  const reg = registration.replace(/\s+/g, "").toUpperCase();
  return {
    registration: reg,
    make: "Demo Motors",
    model: "Example 2.0",
    year: 2019,
    fuel: "Diesel",
    motStatus: "Valid",
    taxStatus: "Taxed",
    mileageAssessment: "Mileage progression appears consistent in the available records.",
    motSummary: "No critical issue is shown in demo mode. Connect the live CarKeeper API for real MOT history.",
    historyFlags: [],
    estimatedValue: { low: 8800, high: 9600, currency: "GBP" }
  };
}

export function demoPurchase({ registration, mileage, askingPrice, advertText }) {
  const vehicle = demoVehicle(registration);
  const asking = Number(askingPrice || 9995);
  return {
    vehicle,
    suppliedMileage: mileage ?? null,
    askingPrice: asking,
    buyerScore: 76,
    recommendation: "NEGOTIATE",
    estimatedValue: vehicle.estimatedValue,
    suggestedOffer: { low: 8750, high: 9200, currency: "GBP" },
    keyFindings: [
      "Mileage history appears broadly consistent in demo mode.",
      "The asking price is above the illustrative valuation range.",
      advertText ? "Advert wording was supplied and would be checked against live vehicle data." : "No advert wording was supplied."
    ],
    questionsForSeller: [
      "Can you provide invoices for recent servicing and maintenance?",
      "Have all MOT advisories been repaired, and is there paperwork to prove it?",
      "Has the vehicle ever had paint or accident repair work?"
    ],
    negotiationPoints: [
      "Use unresolved MOT advisories and upcoming maintenance as evidence, not assumptions.",
      "Compare the asking price with CarKeeper's live valuation before making an offer."
    ],
    disclaimer: "Demo result only. It is not based on live vehicle-history data."
  };
}
