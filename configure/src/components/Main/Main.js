import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import {} from "./MainSlice";
import { makeStyles } from "@mui/styles";

import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

import HomeIcon from "@mui/icons-material/Home";
import LayersIcon from "@mui/icons-material/Layers";
import HandymanIcon from "@mui/icons-material/Handyman";
import ExploreIcon from "@mui/icons-material/Explore";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import ViewQuiltIcon from "@mui/icons-material/ViewQuilt";

import { calls } from "../../core/calls";
import { setConfiguration, setSnackBarText } from "../../core/ConfigureStore";

import SaveBar from "../SaveBar/SaveBar";

import Home from "../Tabs/Home/Home";
import Layers from "../Tabs/Layers/Layers";
import Tools from "../Tabs/Tools/Tools";
import Coordinates from "../Tabs/Coordinates/Coordinates";
import Time from "../Tabs/Time/Time";
import UserInterface from "../Tabs/UserInterface/UserInterface";

import APITokens from "../../pages/APITokens/APITokens";
import GeoDatasets from "../../pages/GeoDatasets/GeoDatasets";

const useStyles = makeStyles((theme) => ({
  Main: {
    width: "100%",
    height: "100%",
    background: theme.palette.swatches.grey[1000],
    boxShadow: `inset 10px 0px 10px -5px rgba(0,0,0,0.3)`,
  },
  tabPage: {
    width: "100%",
    height: "calc(100% - 49px)",
    overflowY: "auto",
  },
  topbar: {
    width: "100%",
    height: "48px",
    minHeight: "48px",
    display: "flex",
    justifyContent: "center",
    background: theme.palette.swatches.grey[1000],
    boxShadow: `inset 10px 0px 10px -5px rgba(0,0,0,0.3)`,
    borderBottom: `1px solid ${theme.palette.swatches.grey[900]} !important`,
  },
  tabs: {
    "& > div": {
      borderRight: "none",
      height: "48px",
      minHeight: "48px",
    },
    "& .MuiTab-root": {
      color: theme.palette.swatches.grey[500],
      height: "48px",
      minHeight: "48px",
      padding: "0px 24px",
      fontSize: "13px",
      textTransform: "none",
      borderBottom: `none !important`,
    },
    "& .MuiTab-root.Mui-selected": {
      background: theme.palette.swatches.grey[900],
      color: theme.palette.swatches.grey[100],
      fontWeight: "bold",
    },

    "& .MuiTabs-indicator": {
      background: theme.palette.swatches.p[0],
    },
  },
  introWrapper: {
    width: "100%",
    height: "100%",
  },
  intro: {
    position: "absolute",
    left: "50%",
    top: "50%",
    textAlign: "center",
    transform: "translateX(-50%) translateY(-50%)",
  },
  title: {
    fontSize: "30px",
    fontWeight: "bold",
    lineHeight: "22px",
    opacity: 0.65,
  },
  subtitle: { letterSpacing: "1px", textTransform: "uppercase", opacity: 0.5 },
  message: {
    fontSize: "13px",
    opacity: 0.6,
  },
  page: { height: "100%" },
}));

export default function Main() {
  const c = useStyles();

  const dispatch = useDispatch();
  const mission = useSelector((state) => state.core.mission);
  const page = useSelector((state) => state.core.page);

  useEffect(() => {
    if (mission != null)
      calls.api(
        "get",
        { mission: mission },
        (res) => {
          dispatch(setConfiguration(res));
        },
        (res) => {
          dispatch(
            setSnackBarText({
              text: res?.message || "Failed to get configuration for mission.",
              severity: "error",
            })
          );
        }
      );
  }, [dispatch, mission]);

  let Page = null;
  switch (page) {
    case "geodatasets":
      Page = <GeoDatasets />;
      break;
    case "api_tokens":
      Page = <APITokens />;
      break;
    default:
  }

  const [tabValue, setTabValue] = useState(0);

  let TabPage = null;
  switch (tabValue) {
    case 0:
      TabPage = <Home />;
      break;
    case 1:
      TabPage = <Layers />;
      break;
    case 2:
      TabPage = <Tools />;
      break;
    case 3:
      TabPage = <Coordinates />;
      break;
    case 4:
      TabPage = <Time />;
      break;
    case 5:
      TabPage = <UserInterface />;
      break;
    default:
  }

  return (
    <div className={c.Main}>
      {Page != null ? (
        <div className={c.page}>{Page}</div>
      ) : mission == null ? (
        <div className={c.introWrapper}>
          <div className={c.intro}>
            <div className={c.title}>MMGIS</div>
            <div className={c.subtitle}>Configuration</div>
            <div className={c.message}>Create or Select a Mission</div>
          </div>
        </div>
      ) : (
        <>
          <div className={c.topbar}>
            <div className={c.tabs}>
              <Tabs
                variant="scrollable"
                value={tabValue}
                onChange={(e, val) => {
                  setTabValue(val);
                }}
                sx={{ borderRight: 1, borderColor: "divider" }}
              >
                <Tab icon={<HomeIcon />} iconPosition="start" label="Home" />
                <Tab
                  icon={<LayersIcon />}
                  iconPosition="start"
                  label="Layers"
                />
                <Tab
                  icon={<HandymanIcon />}
                  iconPosition="start"
                  label="Tools"
                />
                <Tab
                  icon={<ExploreIcon />}
                  iconPosition="start"
                  label="Coordinates"
                />
                <Tab
                  icon={<AccessTimeIcon />}
                  iconPosition="start"
                  label="Time"
                />
                <Tab
                  icon={<ViewQuiltIcon />}
                  iconPosition="start"
                  label="User Interface"
                />
              </Tabs>
            </div>
          </div>
          <div className={c.tabPage}>{TabPage}</div>
          <SaveBar />
        </>
      )}
    </div>
  );
}
