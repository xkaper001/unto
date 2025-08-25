# Unto - AI-Powered Travel Planning Assistant

Unto is an intelligent travel planning application that leverages AI to automatically search and recommend flights and accommodations for your travel needs. Built with modern web technologies and powered by the Portia AI framework, Unto provides a seamless experience for planning your next trip.

## 🌟 Features

- **Smart Travel Planning**: AI-powered search for flights and accommodations
- **Real-time Results**: Live updates on search progress with detailed step tracking
- **Comprehensive Search**: Finds both departure and return flights along with hotel accommodations
- **Multiple Cabin Classes**: Support for economy, business, first, and premium economy
- **Interactive UI**: Modern, responsive interface with smooth animations
- **Direct Booking Links**: Deep links to Skyscanner for flight bookings and hotel booking URLs

## 🏗️ Architecture

Unto consists of two main components:

### Backend (FastAPI + Portia)
- **FastAPI** server providing REST APIs for travel planning
- **Portia SDK** for AI-powered plan execution and tool orchestration
- **Custom Tools** for flight and accommodation search via Apify
- **Real-time State Management** with polling-based updates

### Frontend (Next.js + React)
- **Next.js 15** with App Router for modern React development
- **Tailwind CSS** for styling with Radix UI components
- **Framer Motion** for smooth animations and transitions
- **Real-time Updates** via polling for plan execution status

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and Bun (for frontend)
- Python 3.13+ and UV (for backend)
- API Keys:
  - Google Gemini API key for AI models
  - Apify API token for flight/hotel search

### Environment Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd unto
   ```

2. **Backend Setup**
   ```bash
   cd backend
   # Install dependencies
   uv sync
   
   # Create .env file with required API keys
   echo "GOOGLE_API_KEY=your_google_api_key" >> .env
   echo "APIFY_API_TOKEN=your_apify_token" >> .env
   
   # Start the backend server
   uv run uvicorn app:app --reload --host 0.0.0.0 --port 8000
   ```

3. **Frontend Setup**
   ```bash
   cd frontend/unto
   # Install dependencies
   bun install
   
   # Start the development server
   bun dev
   ```

4. **Access the Application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs

## 🛠️ Technology Stack

### Backend
- **FastAPI** - Modern Python web framework
- **Portia SDK** - AI framework for plan execution and tool orchestration
- **Apify Client** - Web scraping platform for travel data
- **Pydantic** - Data validation and serialization
- **Uvicorn** - ASGI server

### Frontend
- **Next.js 15** - React framework with App Router
- **React 19** - Latest React with concurrent features
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **Radix UI** - Headless UI components
- **Framer Motion** - Animation library
- **Lucide React** - Icon library

## 📱 Usage

1. **Enter Travel Details**
   - Origin and destination cities
   - Departure and return dates
   - Cabin class preference
   - Number of passengers

2. **AI Planning Process**
   - Watch real-time updates as the AI searches for options
   - Track progress through different search steps
   - View intermediate results as they become available

3. **Review Results**
   - Compare departure and return flight options
   - Review accommodation recommendations
   - Access direct booking links for selected options

## 🔧 API Endpoints

### POST `/travel-plan`
Create a new travel plan with the following parameters:
- `origin` - Departure city
- `destination` - Arrival city  
- `departure_date` - Departure date (YYYY-MM-DD)
- `return_date` - Return date (YYYY-MM-DD)
- `cabin_class` - Cabin class (economy, business, first, premiumeconomy)
- `passengers` - Number of passengers

### GET `/plan-status/{plan_id}`
Get the current status and results of a travel plan execution.

## 🏗️ Project Structure

```
unto/
├── backend/                    # FastAPI backend
│   ├── app.py                 # Main FastAPI application
│   ├── plans.py               # Portia plan definitions
│   ├── constants.py           # Configuration and hooks
│   ├── tool/                  # Custom search tools
│   │   ├── flight_search_tool.py
│   │   └── hotel_search_tool.py
│   └── demo_runs/             # Sample execution data
├── frontend/unto/             # Next.js frontend
│   ├── src/
│   │   ├── app/              # App Router pages
│   │   ├── components/       # Reusable UI components
│   │   └── lib/              # Utility functions
│   └── public/               # Static assets
└── README.md                 # This file
```

## 🤖 AI Integration

Unto uses the **Portia SDK** to orchestrate AI-powered travel planning:

- **Google Gemini Models** for natural language processing and decision making
- **Custom Tools** for flight and accommodation search
- **Structured Output** with Pydantic schemas for consistent data format
- **Real-time Hooks** for progress tracking and state updates

## 🔑 Configuration

### Backend Environment Variables
```env
PORTIA_API_KEY=your_portia_api_key
GOOGLE_API_KEY=your_google_gemini_api_key
APIFY_API_TOKEN=your_apify_api_token
```

### AI Model Configuration
The system uses Google Gemini models for different aspects:
- **Execution Model**: `google/gemini-2.5-flash`
- **Planning Model**: `google/gemini-2.5-flash`
- **Summarizer Model**: `google/gemini-2.5-pro`

## 🧪 Development

### Backend Development
```bash
cd backend
uv run uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Development
```bash
cd frontend/unto
bun dev
```

### Building for Production
```bash
# Backend
cd backend
uv build

# Frontend
cd frontend/unto
bun run build
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is part of AgentHack 2025 and is intended for demonstration purposes.

## 🆘 Support

For questions or issues:
1. Check the API documentation at `/docs` when running the backend
2. Ensure all required API keys are properly configured
---

Built with ❤️ for AgentHack 2025
