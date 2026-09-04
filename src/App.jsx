import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import ReportForm from "./pages/ReportForm";
import MyReports from "./pages/MyReports";
import ReportDetails from "./pages/ReportDetails";
import AIAnalysis from "./pages/AIAnalysis";
import Matches from "./pages/Matches";
import MatchDetails from "./pages/MatchDetails";
import Verification from "./pages/Verification";
import Handover from "./pages/Handover";
import Completed from "./pages/Completed";
import Profile from "./pages/Profile";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/report-lost" element={<ReportForm mode="lost" />} />
        <Route path="/report-found" element={<ReportForm mode="found" />} />
        <Route path="/my-reports" element={<MyReports />} />
        <Route path="/reports/:id" element={<ReportDetails />} />
        <Route path="/ai-analysis" element={<AIAnalysis />} />
        <Route path="/matches" element={<Matches />} />
        <Route path="/matches/:id" element={<MatchDetails />} />
        <Route path="/verification" element={<Verification />} />
        <Route path="/handover" element={<Handover />} />
        <Route path="/completed" element={<Completed />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="/404" element={<NotFound />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}