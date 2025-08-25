from typing import Optional
from pydantic import BaseModel
from portia import (
    LLMTool,
)
from portia.end_user import EndUser

from tool.flight_search_tool import FlightSearchTool
from constants import myPortia, myTools

class FlightSearchOutput(BaseModel):
    Airline: Optional[str] = None
    deepLinkUrl: Optional[str] = None
    price: Optional[float] = None
    departTime: Optional[str] = None
    arrivalTime: Optional[str] = None

class AccomodationSearchOutput(BaseModel):
    HotelName: Optional[str] = None
    bookingUrl: Optional[str] = None
    price: Optional[float] = None
    exact_location: Optional[str] = None
    checkInTime: Optional[str] = None
    checkOutTime: Optional[str] = None

class PlanOutputSchema(BaseModel):
    departureFlight: FlightSearchOutput = None
    returnFlight: FlightSearchOutput = None
    accommodation: AccomodationSearchOutput = None

def travel_plan(
    origin,
    destination,
    departure_date,
    return_date,
    cabin_class,
    passengers,
): 
    plan = myPortia.plan(
        tools=myTools,
        # If the user provided their travel details such as preferred cabin class, departure date, and return date.
        query=f"""
        Search flight ticket and Hotel Accomodation. Use the following parameters:
        - Departure city: {origin}
        - Arrival city: {destination}
        - Departure date: {departure_date}
        - Return date: {return_date}
        - Cabin class: {cabin_class}
        - Number of passengers: {passengers}
        Use any date respective to August 24 2025 or raise a clarification if a relative date is provided.
        Be sure to book both the departure and return flights.
        Analyse the flights and accommodation data and return the best flight overview with summary and Deeplink url to book and accommodation details with summary and url to book.
        The Deeplink url should be appended to https://www.skyscanner.co.in<CHOOSEN_DEEPLINK> before returning the response.
        """,
        structured_output_schema=PlanOutputSchema,
    )
    
    # Execute the plan and return the result
    result = myPortia.run_plan(plan)
    return result