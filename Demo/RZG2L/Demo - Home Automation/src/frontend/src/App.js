import * as React from "react";
import {Routes, Route, BrowserRouter} from "react-router-dom"
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import { styled, useTheme, Theme, CSSObject } from "@mui/material/styles";
import Box from "@mui/material/Box";
import MuiDrawer from "@mui/material/Drawer";
import MuiAppBar, { AppBarProps as MuiAppBarProps } from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import List from "@mui/material/List";
import logo from "./assets/logo.svg";
import CssBaseline from "@mui/material/CssBaseline";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import MenuOutlinedIcon from "@mui/icons-material/MenuOutlined";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import "./App.css";
import DevicesPage from "./components/userdashboard/deviceDashboard";
import ChartPage from "./components/userdashboard/ChartData";
import HumidityChart from "./components/userdashboard/humidityData";
import Button from "@mui/material/Button";

import {

  TextField,
} from "@mui/material";
import Tooltip from '@mui/material/Tooltip';
//import { getInstanceIP } from "./components/api";
import { BaseURLProvider } from "./BaseURLContext";

import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
const drawerWidth = 240;

const openedMixin = (theme) => ({
  width: drawerWidth,
  transition: theme.transitions.create("width", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
  overflowX: "hidden",
});

const closedMixin = (theme) => ({
  transition: theme.transitions.create("width", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  overflowX: "hidden",
  width: `calc(${theme.spacing(7)} + 1px)`,
  [theme.breakpoints.up("sm")]: {
    width: 40,
  },
});

const DrawerHeader = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  padding: theme.spacing(0, 1),
  ...theme.mixins.toolbar,
}));

const AppBar = styled(MuiAppBar, {
  shouldForwardProp: (prop) => prop !== "open",
})(({ theme, open }) => ({
  zIndex: theme.zIndex.drawer + 1,
  transition: theme.transitions.create(["width", "margin"], {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  ...(open && {
    marginLeft: drawerWidth,
    width: `calc(100% - ${drawerWidth}px)`,
    transition: theme.transitions.create(["width", "margin"], {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.enteringScreen,
    }),
  }),
}));

const Drawer = styled(MuiDrawer, {
  shouldForwardProp: (prop) => prop !== "open",
})(({ theme, open }) => ({
  width: drawerWidth,
  flexShrink: 0,
  whiteSpace: "nowrap",
  boxSizing: "border-box",
  ...(open && {
    ...openedMixin(theme),
    "& .MuiDrawer-paper": openedMixin(theme),
  }),
  ...(!open && {
    ...closedMixin(theme),
    "& .MuiDrawer-paper": closedMixin(theme),
  }),
}));

export default function MiniDrawer() {
  const [authenticated, setAuthenticated] = React.useState(false);
  const [userType, setUserType] = React.useState(null);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");

  // const[BASE_URL, setBASE_URL] = React.useState('')

  const [colorToolMenu, setColorToolMenu] = React.useState("white");
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [UserDashboardTab, selectUserDashboard] = React.useState(true);
  const [dashboardTab, selectdashboard] = React.useState(false);
  const [curTool, setCurTool] = React.useState(" Dashboard");
  const theme = useTheme();
  const [open, setOpen] = React.useState(false);


  const handleDrawerOpen = () => {

    setOpen(true);

    setColorToolMenu("#00026D");

  };

  const handleDrawerClose = () => {

    setOpen(false);

    setColorToolMenu("white");

  };

  const handleListItemClick = (event, index) => {

    setSelectedIndex(index);

    if (userType === "user") {

      selectUserDashboard(true);

      setCurTool(" Home Automation");

      return;

    }

    if (index === 0) {

      selectUserDashboard(true);

      // selectdashboard(true);

      setCurTool("Home Automation");

    }

  };

  const handleLogout = () => {
    window.location.href = '/';
  }

  if (!authenticated) {
    return (
      <Box
        sx={{
          height: "100vh",
          width: "100vw",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)",
          fontFamily: "sans-serif",
        }}
      >
        <Box
          sx={{
            backgroundColor: "white",
            padding: 4,
            borderRadius: 3,
            boxShadow: 5,
            width: 350,
            textAlign: "center",
          }}
        >
          <Typography
            variant="h5"
            component="h1"
            sx={{ mb: 2, fontWeight: "bold", color: "#00026D" }}
          >
          Smart Home User Login
          </Typography>
          <TextField
            fullWidth
            label="Username"
            variant="outlined"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Password"
            type="password"
            variant="outlined"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            sx={{ mb: 3 }}
          />
          <Button
            fullWidth
            variant="contained"
            sx={{
              backgroundColor: "#00026D",
              "&:hover": {
                backgroundColor: "#1a237e",
              },
            }}
            onClick={() => {
                if(username && password ){
                setUserType("user");
                // selectUserDashboard(true);
                selectdashboard(false);
                setCurTool("Home Automation");
              
                setAuthenticated(true);
                }
            }}
          >
            Login
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex" }}>
      <CssBaseline />
      <AppBar

        className="appbar"

        elevation={4}

        position="fixed"

        open={open}

        sx={{

          bgcolor: "white",

          height: "40px",

          borderRadius: "0px 0px 15px 15px",

          paddingLeft: "0px",

          minHeight: "40px",

        }}
      >
        <Toolbar className="toolbar" variant="dense">
          <IconButton

            color="inherit"

            onClick={handleDrawerOpen}

            sx={{

              "&:hover": { backgroundColor: "#00026D" },

              zIndex: 1000,

              width: 40,

              height: 40,

              borderRadius: "0px 0px 0px 15px",

              color: "white",

              backgroundColor: "#00026D",

            }}
          >
            <MenuOutlinedIcon />
          </IconButton>

          <img className="renesas_logo" src={logo} alt="logo" />

          <Typography

            textAlign="center"

            variant="h4"

            style={{ color: "#00026D", top: "40%" }}
          >
            <div

              style={{

                marginLeft: "16px",

                marginRight: "16px",

                top: "40%",

                fontSize: "16px",

                color: "#9594CE",

              }}
            >

              |
            </div>
          </Typography>
          <Typography

            variant="h7"

            noWrap

            textAlign="center"

            sx={{

              color: "#00026D",

              top: "40%",

            }}
          >
            <center>{curTool}</center>
          </Typography>
          <Box sx={{ flexGrow: 1 }} />

          {/* Logout Button */}
          <Tooltip title="Logout">
            <IconButton
              variant="outlined"
              color="error"
              onClick={handleLogout}
            // startIcon={<LogoutIcon/>}

            >
              <PowerSettingsNewIcon sx={{
                color: "#00026D",
                width: "20px",
                height: "20px",
              }} />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>
      <Drawer

        className="drawer"

        variant="permanent"

        open={open}

        sx={{

          width: "40px",

          zIndex: "999",

          padding: "0px",

          margin: 0,

          borderRight: "0px",

        }}
      >
        <DrawerHeader className="drawerheader">
          <Typography

            variant="h7"

            sx={{

              color: "white",

              width: "250px",

              padding: "0px 0",

              margin: "0px",

              backgroundColor: colorToolMenu,

              top: "-5%",

              borderRadius: "0px 0px 0px 15px",

            }}
          >
            &nbsp;&nbsp;TOOL MENU
            <IconButton

              onClick={handleDrawerClose}

              className="iconMenuButton"

              sx={{ paddingLeft: "100px" }}
            >

              {theme.direction === "rtl" ? (
                <CloseOutlinedIcon

                  sx={{

                    color: "#00026D",

                    width: "20px",

                    height: "20px",

                  }}

                />

              ) : (
                <CloseOutlinedIcon

                  sx={{

                    color: "white",

                  }}

                />

              )}
            </IconButton>
          </Typography>
        </DrawerHeader>

        <List style={{ color: "#30449c" }}>

          {[

            // "Dashboard",

            "UserDashboard",

          ]

            .filter((text, index) => {


              return index === 0;

            })

            .map((text, index) => (
              <ListItem

                key={text}

                disablePadding

                sx={{ display: "block", height: "40px" }}
              >
                <ListItemButton

                  selected={selectedIndex === index}

                  onClick={(event) => handleListItemClick(event, index)}

                  sx={{

                    "&.Mui-selected": {

                      backgroundColor: "#E7E7F3",

                    },

                    minHeight: 32,

                    height: "32px",

                    justifyContent: open ? "initial" : "center",

                    borderRadius: "5px",

                    margin: "4px",

                  }}
                >
                  <ListItemIcon

                    sx={{

                      minWidth: 0,

                      mr: open ? 3 : "auto",

                      justifyContent: "center",

                    }}
                  >

                    {(() => {

                      
                     if (index == 0) {

                        return (
                          <>
                          <HomeOutlinedIcon
                            
                            sx={{

                              color: "#00026D",

                              width: "20px",

                              height: "20px",

                            }}

                          />
                          <Divider />
                            </>
                          );

                      }

                    })()}
                  </ListItemIcon>
                  <ListItemText

                    primary={text}

                    sx={{ opacity: open ? 1 : 0 }}

                  />
                </ListItemButton>
              </ListItem>

            ))}
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <DrawerHeader />
       
        <BrowserRouter>
         <BaseURLProvider>
         <Routes> 
         <Route path="/" element={<DevicesPage />}/>
        </Routes>
        </BaseURLProvider>
        </BrowserRouter>
      </Box>
    </Box>

  );

}

