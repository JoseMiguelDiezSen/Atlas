using Microsoft.AspNetCore.Mvc;

namespace Atlas.Controllers
{
    public class VisorController : Controller
    {
        public IActionResult Index()
        {
            return View();
        }
    }
}
